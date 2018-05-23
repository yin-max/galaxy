define("mvc/history/job-states-model",["exports","libs/backbone","utils/ajax-queue"],function(t,e,n){"use strict";Object.defineProperty(t,"__esModule",{value:!0});var i=function(t){if(t&&t.__esModule)return t;var e={};if(null!=t)for(var n in t)Object.prototype.hasOwnProperty.call(t,n)&&(e[n]=t[n]);return e.default=t,e}(e),r=function(t){return t&&t.__esModule?t:{default:t}}(n),u=["new","queued","running"],o=["error","deleted"],a=i.Model.extend({url:function(){return Galaxy.root+"api/histories/"+this.attributes.history_id+"/contents/dataset_collections/"+this.attributes.collection_id+"/jobs_summary"},hasDetails:function(){return this.has("populated_state")},new:function(){return!this.hasDetails()||"new"==this.get("populated_state")},errored:function(){return"error"===this.get("populated_state")||this.anyWithStates(o)},states:function(){return this.get("states")||{}},anyWithState:function(t){return(this.states()[t]||0)>0},anyWithStates:function(t){var e=this.states();for(var n in t)if((e[t[n]]||0)>0)return!0;return!1},numWithStates:function(t){var e=this.states(),n=0;for(var i in t)n+=e[t[i]]||0;return n},numInError:function(){return this.numWithStates(o)},running:function(){return this.anyWithState("running")},terminal:function(){return!this.new()&&!this.anyWithStates(u)},jobCount:function(){var t=this.states(),e=0;for(var n in t)e+=t[n];return e},toString:function(){return"JobStatesSummary(id="+this.get("id")+")"}}),s=i.Collection.extend({model:a,initialize:function(){var t=this;this.on({add:function(e){t.active||e.fetch()}}),this.updateTimeoutId=null,this.active=!0},url:function(){var t=this.models.filter(function(t){return!t.terminal()}),e=t.map(function(t){return t.get("id")}).join(","),n=t.map(function(t){return t.get("model")}).join(",");return Galaxy.root+"api/histories/"+this.historyId+"/jobs_summary?ids="+e+"&types="+n},monitor:function(){var t=this;if(this.clearUpdateTimeout(),this.active){var e=function(){t.updateTimeoutId=setTimeout(function(){t.monitor()},2e3)},n=this.models.filter(function(t){return!t.terminal()});if(n.length,!1){var i=n.map(function(t){return function(){return t.fetch()}});return new r.default.AjaxQueue(i).done(e)}n.length>0?this.fetch({remove:!1}).done(e):e()}},clearUpdateTimeout:function(){this.updateTimeoutId&&(clearTimeout(this.updateTimeoutId),this.updateTimeoutId=null)},toString:function(){return"JobStatesSummaryCollection()"}});t.default={JobStatesSummary:a,JobStatesSummaryCollection:s,FETCH_STATE_ON_ADD:!1,NON_TERMINAL_STATES:u,ERROR_STATES:o}});