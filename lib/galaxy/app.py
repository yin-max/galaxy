import logging
import signal
import sys
import time

import galaxy.model
import galaxy.model.security
import galaxy.queues
import galaxy.security
from galaxy import config, job_metrics, jobs
from galaxy.config_watchers import ConfigWatchers
from galaxy.containers import build_container_interfaces
from galaxy.files import ConfiguredFileSources
from galaxy.managers.collections import DatasetCollectionManager
from galaxy.managers.folders import FolderManager
from galaxy.managers.hdas import HDAManager
from galaxy.managers.histories import HistoryManager
from galaxy.managers.interactivetool import InteractiveToolManager
from galaxy.managers.libraries import LibraryManager
from galaxy.managers.tools import DynamicToolManager
from galaxy.managers.users import UserManager
from galaxy.managers.workflows import WorkflowsManager
from galaxy.model.database_heartbeat import DatabaseHeartbeat
from galaxy.model.tags import GalaxyTagHandler
from galaxy.queue_worker import (
    GalaxyQueueWorker,
    send_local_control_task,
)
from galaxy.quota import get_quota_agent
from galaxy.tool_shed.galaxy_install.installed_repository_manager import InstalledRepositoryManager
from galaxy.tool_shed.galaxy_install.update_repository_manager import UpdateRepositoryManager
from galaxy.tool_util.deps.views import DependencyResolversView
from galaxy.tool_util.verify import test_data
from galaxy.tools.cache import (
    ToolCache,
    ToolShedRepositoryCache
)
from galaxy.tools.data_manager.manager import DataManagers
from galaxy.tools.error_reports import ErrorReports
from galaxy.tools.special_tools import load_lib_tools
from galaxy.tours import ToursRegistry
from galaxy.util import (
    ExecutionTimer,
    heartbeat,
    StructuredExecutionTimer,
)
from galaxy.visualization.data_providers.registry import DataProviderRegistry
from galaxy.visualization.genomes import Genomes
from galaxy.visualization.plugins.registry import VisualizationsRegistry
from galaxy.web import url_for
from galaxy.web.proxy import ProxyManager
from galaxy.web_stack import application_stack_instance
from galaxy.webhooks import WebhooksRegistry
from galaxy.workflow.trs_proxy import TrsProxy

log = logging.getLogger(__name__)
app = None


class UniverseApplication(config.ConfiguresGalaxyMixin):
    """Encapsulates the state of a Universe application"""

    def __init__(self, **kwargs):
        if not log.handlers:
            # Paste didn't handle it, so we need a temporary basic log
            # configured.  The handler added here gets dumped and replaced with
            # an appropriately configured logger in configure_logging below.
            logging.basicConfig(level=logging.DEBUG)
        log.debug("python path is: %s", ", ".join(sys.path))
        self.name = 'galaxy'
        # is_webapp will be set to true when building WSGI app
        self.is_webapp = False
        self.startup_timer = ExecutionTimer()
        self.new_installation = False
        # Read config file and check for errors
        self.config = config.Configuration(**kwargs)
        self.config.check()
        config.configure_logging(self.config)
        self.execution_timer_factory = ExecutionTimerFactory(self.config)
        self.configure_fluent_log()
        # A lot of postfork initialization depends on the server name, ensure it is set immediately after forking before other postfork functions
        self.application_stack = application_stack_instance(app=self)
        self.application_stack.register_postfork_function(self.application_stack.set_postfork_server_name, self)
        self.config.reload_sanitize_allowlist(explicit='sanitize_allowlist_file' in kwargs)
        self.amqp_internal_connection_obj = galaxy.queues.connection_from_config(self.config)
        # queue_worker *can* be initialized with a queue, but here we don't
        # want to and we'll allow postfork to bind and start it.
        self.queue_worker = GalaxyQueueWorker(self)

        self._configure_tool_shed_registry()
        self._configure_object_store(fsmon=True)
        # Setup the database engine and ORM
        config_file = kwargs.get('global_conf', {}).get('__file__', None)
        if config_file:
            log.debug('Using "galaxy.ini" config file: %s', config_file)
        check_migrate_tools = self.config.check_migrate_tools
        self._configure_models(check_migrate_databases=self.config.check_migrate_databases, check_migrate_tools=check_migrate_tools, config_file=config_file)

        # Security helper
        self._configure_security()
        # Tag handler
        self.tag_handler = GalaxyTagHandler(self.model.context)
        self.dataset_collections_service = DatasetCollectionManager(self)
        self.history_manager = HistoryManager(self)
        self.hda_manager = HDAManager(self)
        self.workflow_manager = WorkflowsManager(self)
        self.dependency_resolvers_view = DependencyResolversView(self)
        self.test_data_resolver = test_data.TestDataResolver(file_dirs=self.config.tool_test_data_directories)
        self.library_folder_manager = FolderManager()
        self.library_manager = LibraryManager()
        self.dynamic_tool_manager = DynamicToolManager(self)

        # ConfiguredFileSources
        self.file_sources = ConfiguredFileSources.from_app_config(self.config)

        # Tool Data Tables
        self._configure_tool_data_tables(from_shed_config=False)
        # Load dbkey / genome build manager
        self._configure_genome_builds(data_table_name="__dbkeys__", load_old_style=True)

        # Genomes
        self.genomes = Genomes(self)
        # Data providers registry.
        self.data_provider_registry = DataProviderRegistry()

        # Initialize job metrics manager, needs to be in place before
        # config so per-destination modifications can be made.
        self.job_metrics = job_metrics.JobMetrics(self.config.job_metrics_config_file, app=self)

        # Initialize error report plugins.
        self.error_reports = ErrorReports(self.config.error_report_file, app=self)

        # Initialize the job management configuration
        self.job_config = jobs.JobConfiguration(self)

        # Setup a Tool Cache
        self.tool_cache = ToolCache()
        self.tool_shed_repository_cache = ToolShedRepositoryCache(self)
        # Watch various config files for immediate reload
        self.watchers = ConfigWatchers(self)
        self._configure_tool_config_files()
        self.installed_repository_manager = InstalledRepositoryManager(self)
        self._configure_datatypes_registry(self.installed_repository_manager)
        galaxy.model.set_datatypes_registry(self.datatypes_registry)

        self._configure_toolbox()

        # Load Data Manager
        self.data_managers = DataManagers(self)
        # Load the update repository manager.
        self.update_repository_manager = UpdateRepositoryManager(self)
        # Load proprietary datatype converters and display applications.
        self.installed_repository_manager.load_proprietary_converters_and_display_applications()
        # Load datatype display applications defined in local datatypes_conf.xml
        self.datatypes_registry.load_display_applications(self)
        # Load datatype converters defined in local datatypes_conf.xml
        self.datatypes_registry.load_datatype_converters(self.toolbox)
        # Load external metadata tool
        self.datatypes_registry.load_external_metadata_tool(self.toolbox)
        # Load history import/export tools.
        load_lib_tools(self.toolbox)
        self.toolbox.persist_cache(register_postfork=True)
        # visualizations registry: associates resources with visualizations, controls how to render
        self.visualizations_registry = VisualizationsRegistry(
            self,
            directories_setting=self.config.visualization_plugins_directory,
            template_cache_dir=self.config.template_cache_path)
        # Tours registry
        self.tour_registry = ToursRegistry(self.config.tour_config_dir)
        # Webhooks registry
        self.webhooks_registry = WebhooksRegistry(self.config.webhooks_dir)
        # Load security policy.
        self.security_agent = self.model.security_agent
        self.host_security_agent = galaxy.model.security.HostAgent(
            model=self.security_agent.model,
            permitted_actions=self.security_agent.permitted_actions)
        # Load quota management.
        self.quota_agent = get_quota_agent(self.config, self.model)
        # Heartbeat for thread profiling
        self.heartbeat = None
        from galaxy import auth
        self.auth_manager = auth.AuthManager(self)
        self.user_manager = UserManager(self)
        # Start the heartbeat process if configured and available (wait until
        # postfork if using uWSGI)
        if self.config.use_heartbeat:
            if heartbeat.Heartbeat:
                self.heartbeat = heartbeat.Heartbeat(
                    self.config,
                    period=self.config.heartbeat_interval,
                    fname=self.config.heartbeat_log
                )
                self.heartbeat.daemon = True
                self.application_stack.register_postfork_function(self.heartbeat.start)

        self.authnz_manager = None
        if self.config.enable_oidc:
            from galaxy.authnz import managers
            self.authnz_manager = managers.AuthnzManager(self,
                                                         self.config.oidc_config_file,
                                                         self.config.oidc_backends_config_file)

        self.sentry_client = None
        if self.config.sentry_dsn:

            def postfork_sentry_client():
                import raven
                self.sentry_client = raven.Client(self.config.sentry_dsn, transport=raven.transport.HTTPTransport)

            self.application_stack.register_postfork_function(postfork_sentry_client)

        # Transfer manager client
        if self.config.get_bool('enable_beta_job_managers', False):
            from galaxy.jobs import transfer_manager
            self.transfer_manager = transfer_manager.TransferManager(self)
        # Start the job manager
        from galaxy.jobs import manager
        self.job_manager = manager.JobManager(self)
        self.application_stack.register_postfork_function(self.job_manager.start)
        self.proxy_manager = ProxyManager(self.config)

        from galaxy.workflow import scheduling_manager
        # Must be initialized after job_config.
        self.workflow_scheduling_manager = scheduling_manager.WorkflowSchedulingManager(self)

        self.trs_proxy = TrsProxy(self.config)
        # Must be initialized after any component that might make use of stack messaging is configured. Alternatively if
        # it becomes more commonly needed we could create a prefork function registration method like we do with
        # postfork functions.
        self.application_stack.init_late_prefork()

        self.containers = {}
        if self.config.enable_beta_containers_interface:
            self.containers = build_container_interfaces(
                self.config.containers_config_file,
                containers_conf=self.config.containers_conf
            )

        self.interactivetool_manager = InteractiveToolManager(self)

        # Configure handling of signals
        handlers = {}
        if self.heartbeat:
            handlers[signal.SIGUSR1] = self.heartbeat.dump_signal_handler
        self._configure_signal_handlers(handlers)

        self.database_heartbeat = DatabaseHeartbeat(
            application_stack=self.application_stack
        )
        self.database_heartbeat.add_change_callback(self.watchers.change_state)
        self.application_stack.register_postfork_function(self.database_heartbeat.start)

        # Start web stack message handling
        self.application_stack.register_postfork_function(self.application_stack.start)
        self.application_stack.register_postfork_function(self.queue_worker.bind_and_start)
        # Delay toolbox index until after startup
        self.application_stack.register_postfork_function(lambda: send_local_control_task(self, 'rebuild_toolbox_search_index'))

        self.model.engine.dispose()

        # Inject url_for for components to more easily optionally depend
        # on url_for.
        self.url_for = url_for

        self.server_starttime = int(time.time())  # used for cachebusting
        log.info("Galaxy app startup finished %s" % self.startup_timer)

    def shutdown(self):
        log.debug('Shutting down')
        exception = None
        try:
            self.queue_worker.shutdown()
        except Exception as e:
            exception = exception or e
            log.exception("Failed to shutdown control worker cleanly")
        try:
            self.watchers.shutdown()
        except Exception as e:
            exception = exception or e
            log.exception("Failed to shutdown configuration watchers cleanly")
        try:
            self.database_heartbeat.shutdown()
        except Exception as e:
            exception = exception or e
            log.exception("Failed to shutdown database heartbeat cleanly")
        try:
            self.workflow_scheduling_manager.shutdown()
        except Exception as e:
            exception = exception or e
            log.exception("Failed to shutdown workflow scheduling manager cleanly")
        try:
            self.job_manager.shutdown()
        except Exception as e:
            exception = exception or e
            log.exception("Failed to shutdown job manager cleanly")
        try:
            self.object_store.shutdown()
        except Exception as e:
            exception = exception or e
            log.exception("Failed to shutdown object store cleanly")
        try:
            if self.heartbeat:
                self.heartbeat.shutdown()
        except Exception as e:
            exception = exception or e
            log.exception("Failed to shutdown heartbeat cleanly")
        try:
            self.update_repository_manager.shutdown()
        except Exception as e:
            exception = exception or e
            log.exception("Failed to shutdown update repository manager cleanly")

        try:
            self.model.engine.dispose()
        except Exception as e:
            exception = exception or e
            log.exception("Failed to shutdown SA database engine cleanly")

        try:
            self.application_stack.shutdown()
        except Exception as e:
            exception = exception or e
            log.exception("Failed to shutdown application stack interface cleanly")

        if exception:
            raise exception
        else:
            log.debug('Finished shutting down')

    def configure_fluent_log(self):
        if self.config.fluent_log:
            from galaxy.util.custom_logging.fluent_log import FluentTraceLogger
            self.trace_logger = FluentTraceLogger('galaxy', self.config.fluent_host, self.config.fluent_port)
        else:
            self.trace_logger = None

    @property
    def is_job_handler(self):
        return (self.config.track_jobs_in_database and self.job_config.is_handler) or not self.config.track_jobs_in_database


class StatsdStructuredExecutionTimer(StructuredExecutionTimer):

    def __init__(self, galaxy_statsd_client, *args, **kwds):
        self.galaxy_statsd_client = galaxy_statsd_client
        super().__init__(*args, **kwds)

    def to_str(self, **kwd):
        self.galaxy_statsd_client.timing(self.timer_id, self.elapsed * 1000., kwd)
        return super().to_str(**kwd)


class ExecutionTimerFactory:

    def __init__(self, config):
        statsd_host = getattr(config, "statsd_host", None)
        if statsd_host:
            from galaxy.web.framework.middleware.statsd import GalaxyStatsdClient
            self.galaxy_statsd_client = GalaxyStatsdClient(
                statsd_host,
                getattr(config, 'statsd_port', 8125),
                getattr(config, 'statsd_prefix', 'galaxy'),
                getattr(config, 'statsd_influxdb', False),
            )
        else:
            self.galaxy_statsd_client = None

    def get_timer(self, *args, **kwd):
        if self.galaxy_statsd_client:
            return StatsdStructuredExecutionTimer(self.galaxy_statsd_client, *args, **kwd)
        else:
            return StructuredExecutionTimer(*args, **kwd)
