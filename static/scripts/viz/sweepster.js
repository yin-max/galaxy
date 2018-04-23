define(["libs/underscore","libs/d3","viz/trackster/util","viz/visualization","viz/trackster/tracks","mvc/tool/tools","mvc/dataset/data","utils/config","mvc/ui/icon-button"],function(a,b,c,d,e,f,g,h,i){var j=Backbone.Model.extend({defaults:{inputs:null,values:null}}),k=Backbone.Model.extend({defaults:{tool:null,tree_data:null},initialize:function(b){var c=this;this.get("tool").get("inputs").each(function(a){a.on("change:min change:max change:num_samples",function(a){a.get("in_ptree")&&c.set_tree_data()},c),a.on("change:in_ptree",function(a){a.get("in_ptree")?c.add_param(a):c.remove_param(a),c.set_tree_data()},c)}),b.config&&a.each(b.config,function(a){var b=c.get("tool").get("inputs").find(function(b){return b.get("name")===a.name});c.add_param(b),b.set(a)})},add_param:function(a){a.get("ptree_index")||(a.set("in_ptree",!0),a.set("ptree_index",this.get_tree_params().length))},remove_param:function(b){b.set("in_ptree",!1),b.set("ptree_index",null),a(this.get_tree_params()).each(function(a,b){a.set("ptree_index",b+1)})},set_tree_data:function(){var b=a.map(this.get_tree_params(),function(a){return{param:a,samples:a.get_samples()}}),c=0,d=function(b,e){var f=b[e],g=f.param,h=(g.get("label"),f.samples);return b.length-1===e?a.map(h,function(a){return{id:c++,name:a,param:g,value:a}}):a.map(h,function(a){return{id:c++,name:a,param:g,value:a,children:d(b,e+1)}})};this.set("tree_data",{name:"Root",id:c++,children:0!==b.length?d(b,0):null})},get_tree_params:function(){return a(this.get("tool").get("inputs").where({in_ptree:!0})).sortBy(function(a){return a.get("ptree_index")})},get_num_leaves:function(){return this.get_tree_params().reduce(function(a,b){return a*b.get_samples().length},1)},get_node_settings:function(b){var c=this.get("tool").get_inputs_dict(),d=b.parent;if(d)for(;0!==d.depth;)c[d.param.get("name")]=d.value,d=d.parent;var e=this,f=function(b,c){return b.param&&(c[b.param.get("name")]=b.value),b.children?a.flatten(a.map(b.children,function(b){return f(b,a.clone(c))})):new j({inputs:e.get("tool").get("inputs"),values:c})},g=f(b,c);return a.isArray(g)||(g=[g]),g},get_connected_nodes:function(b){for(var c=function(b){return b.children?a.flatten([b,a.map(b.children,function(a){return c(a)})]):b},d=[],e=b.parent;e;)d.push(e),e=e.parent;return a.flatten([d,c(b)])},get_leaf:function(b){for(var c=this.get("tree_data"),d=function(c){return a.find(c,function(a){return b[a.param.get("name")]===a.value})};c.children;)c=d(c.children);return c},toJSON:function(){return this.get_tree_params().map(function(a){return{name:a.get("name"),min:a.get("min"),max:a.get("max"),num_samples:a.get("num_samples")}})}}),l=Backbone.Model.extend({defaults:{track:null,mode:"Pack",settings:null,regions:null},initialize:function(b){if(this.set("regions",b.regions),b.track){var c=a.extend({data_url:Galaxy.root+"dummy1",converted_datasets_state_url:Galaxy.root+"dummy2"},b.track);this.set("track",e.object_from_template(c,{},null))}},same_settings:function(a){var b=this.get("settings"),c=a.get("settings");for(var d in b)if(!c[d]||b[d]!==c[d])return!1;return!0},toJSON:function(){return{track:this.get("track").to_dict(),settings:this.get("settings"),regions:this.get("regions")}}}),m=Backbone.Collection.extend({model:l}),n=d.Visualization.extend({defaults:a.extend({},d.Visualization.prototype.defaults,{dataset:null,tool:null,parameter_tree:null,regions:null,tracks:null,default_mode:"Pack"}),initialize:function(a){this.set("dataset",new g.Dataset(a.dataset)),this.set("tool",new f.Tool(a.tool)),this.set("regions",new d.GenomeRegionCollection(a.regions)),this.set("tracks",new m(a.tracks));var b=this.get("tool");this.set("tool_with_samplable_inputs",b),b.remove_inputs(["data","hidden_data","conditional","text"]),this.set("parameter_tree",new k({tool:b,config:a.tree_config}))},add_track:function(a){this.get("tracks").add(a)},toJSON:function(){return{id:this.get("id"),title:"Parameter exploration for dataset '"+this.get("dataset").get("name")+"'",type:"sweepster",dataset_id:this.get("dataset").id,tool_id:this.get("tool").id,regions:this.get("regions").toJSON(),tree_config:this.get("parameter_tree").toJSON(),tracks:this.get("tracks").toJSON()}}}),o=Backbone.View.extend({tagName:"tr",TILE_LEN:250,initialize:function(a){this.canvas_manager=a.canvas_manager,this.render(),this.model.on("change:track change:mode",this.draw_tiles,this)},render:function(){var a=this.model.get("settings"),b=a.get("values"),c=$("<td/>").addClass("settings").appendTo(this.$el),d=$("<div/>").addClass("track-info").hide().appendTo(c);d.append($("<div/>").css("font-weight","bold").text("Track Settings")),a.get("inputs").each(function(a){d.append(a.get("label")+": "+b[a.get("name")]+"<br/>")});var e=this,f=($("<button/>").appendTo(d).text("Run on complete dataset").click(function(){d.toggle(),e.trigger("run_on_dataset",a)}),i.create_icon_buttons_menu([{title:"Settings",icon_class:"gear track-settings",on_click:function(){d.toggle()}},{title:"Remove",icon_class:"cross-circle",on_click:function(){e.$el.remove(),$(".tooltip").remove()}}]));c.prepend(f.$el),this.model.get("regions").each(function(){e.$el.append($("<td/>").addClass("tile").html($("<img/>").attr("src",Galaxy.root+"images/loading_large_white_bg.gif")))}),this.model.get("track")&&this.draw_tiles()},draw_tiles:function(){var a=this,b=this.model.get("track"),c=this.model.get("regions"),d=this.$el.find("td.tile");b&&$.when(b.data_manager.data_is_ready()).then(function(){c.each(function(c,e){var f=c.length()/a.TILE_LEN,g=1/f,h=a.model.get("mode");$.when(b.data_manager.get_data(c,h,f,{})).then(function(f){var i=a.canvas_manager.new_canvas();i.width=a.TILE_LEN,i.height=b.get_canvas_height(f,h,g,i.width),b.draw_tile(f,i.getContext("2d"),h,c,g),$(d[e]).empty().append(i)})})})}}),p=Backbone.View.extend({number_input_template:'<div class="form-row-input sweep"><input class="min" type="text" size="6" value="<%= min %>"> - <input class="max" type="text" size="6" value="<%= max %>"> samples: <input class="num_samples" type="text" size="1" value="<%= num_samples %>"></div>',select_input_template:'<div class="form-row-input sweep"><%= options %></div>',initialize:function(a){this.$el=a.tool_row,this.render()},render:function(){var b=this.model,c=(b.get("type"),this.$el.find(".form-row-input")),d=null;if(c.find(":input").change(function(){b.set("value",$(this).val())}),b instanceof f.IntegerToolParameter)d=$(a.template(this.number_input_template)(this.model.toJSON()));else if(b instanceof f.SelectToolParameter){var e=a.map(this.$el.find("select option"),function(a){return $(a).val()}),g=e.join(", ");d=$(a.template(this.select_input_template)({options:g}))}d.insertAfter(c);var h=this,j=i.create_icon_buttons_menu([{title:"Add parameter to tree",icon_class:"plus-button",on_click:function(){b.set("in_ptree",!0),c.hide(),d.show(),$(this).hide(),h.$el.find(".icon-button.toggle").show()}},{title:"Remove parameter from tree",icon_class:"toggle",on_click:function(){b.set("in_ptree",!1),d.hide(),c.show(),$(this).hide(),h.$el.find(".icon-button.plus-button").show()}}],{});this.$el.prepend(j.$el),b.get("in_ptree")?(c.hide(),h.$el.find(".icon-button.plus-button").hide()):(h.$el.find(".icon-button.toggle").hide(),d.hide()),a.each(["min","max","num_samples"],function(a){d.find("."+a).change(function(){b.set(a,parseFloat($(this).val()))})})}}),q=Backbone.View.extend({className:"tree-design",initialize:function(){this.render()},render:function(){var a=new f.ToolFormView({model:this.model.get("tool")});a.render(),this.$el.append(a.$el);var b=this,c=b.model.get("tool").get("inputs");this.$el.find(".form-row").not(".form-actions").each(function(a){new p({model:c.at(a),tool_row:$(this)})})}}),r=Backbone.View.extend({className:"tool-parameter-tree",initialize:function(){this.model.on("change:tree_data",this.render,this)},render:function(){this.$el.children().remove();var c=this.model.get_tree_params();if(c.length){this.width=100*(2+c.length),this.height=15*this.model.get_num_leaves();var d=this,e=b.layout.cluster().size([this.height,this.width-160]),f=b.svg.diagonal().projection(function(a){return[a.y,a.x]}),g=e.nodes(this.model.get("tree_data")),h=a.uniq(a.pluck(g,"y"));a.each(c,function(a,b){var c=h[b+1],e=$("#center").position().left;d.$el.append($("<div>").addClass("label").text(a.get("label")).css("left",c+e))});var i=b.select(this.$el[0]).append("svg").attr("width",this.width).attr("height",this.height+30).append("g").attr("transform","translate(40, 20)"),j=(i.selectAll("path.link").data(e.links(g)).enter().append("path").attr("class","link").attr("d",f),i.selectAll("g.node").data(g).enter().append("g").attr("class","node").attr("transform",function(a){return"translate("+a.y+","+a.x+")"}).on("mouseover",function(b){var c=a.pluck(d.model.get_connected_nodes(b),"id");j.filter(function(b){return void 0!==a.find(c,function(a){return a===b.id})}).style("fill","#f00")}).on("mouseout",function(){j.style("fill","#000")}));j.append("circle").attr("r",9),j.append("text").attr("dx",function(a){return a.children?-12:12}).attr("dy",3).attr("text-anchor",function(a){return a.children?"end":"start"}).text(function(a){return a.name})}}}),s=Backbone.View.extend({className:"Sweepster",helpText:"<div><h4>Getting Started</h4><ol><li>Create a parameter tree by using the icons next to the tool's parameter names to add or remove parameters.<li>Adjust the tree by using parameter inputs to select min, max, and number of samples<li>Run the tool with different settings by clicking on tree nodes</ol></div>",initialize:function(){this.canvas_manager=new d.CanvasManager(this.$el.parents("body")),this.tool_param_tree_view=new r({model:this.model.get("parameter_tree")}),this.track_collection_container=$("<table/>").addClass("tracks"),this.model.get("parameter_tree").on("change:tree_data",this.handle_node_clicks,this);var a=this;this.model.get("tracks").each(function(b){b.get("track").view=a}),this.config=h.ConfigSettingCollection.from_models_and_saved_values([{key:"name",label:"Name",type:"text",default_value:""},{key:"a_color",label:"A Color",type:"color",default_value:"#FF0000"},{key:"c_color",label:"C Color",type:"color",default_value:"#00FF00"},{key:"g_color",label:"G Color",type:"color",default_value:"#0000FF"},{key:"t_color",label:"T Color",type:"color",default_value:"#FF00FF"},{key:"n_color",label:"N Color",type:"color",default_value:"#AAAAAA"},{key:"block_color",label:"Block color",type:"color"},{key:"reverse_strand_color",label:"Antisense strand color",type:"color"}],{})},render:function(){var b=new q({model:this.model.get("parameter_tree")});$("#left").append(b.$el);var c=this,d=c.model.get("regions"),e=$("<tr/>").appendTo(this.track_collection_container);d.each(function(a){e.append($("<th>").text(a.toString()))}),e.children().first().attr("colspan",2);var f=$("<div>").addClass("tiles");$("#right").append(f.append(this.track_collection_container)),c.model.get("tracks").each(function(a){c.add_track(a)});var g=$(this.helpText).addClass("help"),h=i.create_icon_buttons_menu([{title:"Close",icon_class:"cross-circle",on_click:function(){$(".tooltip").remove(),g.remove()}}]);g.prepend(h.$el.css("float","right")),$("#center").append(g),this.tool_param_tree_view.render(),$("#center").append(this.tool_param_tree_view.$el),this.handle_node_clicks();var j=i.create_icon_buttons_menu([{icon_class:"chevron-expand",title:"Set display mode"},{icon_class:"cross-circle",title:"Close",on_click:function(){window.location="${h.url_for( controller='visualization', action='list' )}"}}],{tooltip_config:{placement:"bottom"}}),k=["Squish","Pack"],l={};a.each(k,function(a){l[a]=function(){c.model.set("default_mode",a),c.model.get("tracks").each(function(b){b.set("mode",a)})}}),make_popupmenu(j.$el.find(".chevron-expand"),l),j.$el.attr("style","float: right"),$("#right .unified-panel-header-inner").append(j.$el)},get_base_color:function(a){return this.config.get_value(a.toLowerCase()+"_color")||this.config.get_value("n_color")},run_tool_on_dataset:function(a){var b=this.model.get("tool"),c=b.get("name"),d=this.model.get("dataset");b.set_input_values(a.get("values")),$.when(b.rerun(d)).then(function(){}),show_modal("Running "+c+" on complete dataset",c+" is running on dataset '"+d.get("name")+"'. Outputs are in the dataset's history.",{Ok:function(){hide_modal()}})},add_track:function(c){var d=this,e=this.model.get("parameter_tree");d.model.add_track(c);var f=new o({model:c,canvas_manager:d.canvas_manager});return f.on("run_on_dataset",d.run_tool_on_dataset,d),d.track_collection_container.append(f.$el),f.$el.hover(function(){var f=e.get_leaf(c.get("settings").get("values")),g=a.pluck(e.get_connected_nodes(f),"id");b.select(d.tool_param_tree_view.$el[0]).selectAll("g.node").filter(function(b){return void 0!==a.find(g,function(a){return a===b.id})}).style("fill","#f00")},function(){b.select(d.tool_param_tree_view.$el[0]).selectAll("g.node").style("fill","#000")}),c},handle_node_clicks:function(){var c=this,d=this.model.get("parameter_tree"),f=this.model.get("regions"),g=b.select(this.tool_param_tree_view.$el[0]).selectAll("g.node");g.on("click",function(b){var g=c.model.get("tool"),h=c.model.get("dataset"),i=d.get_node_settings(b),j=$.Deferred();i.length>=10?show_modal("Whoa there cowboy!","You clicked on a node to try "+c.model.get("tool").get("name")+" with "+i.length+" different combinations of settings. You can only run 10 jobs at a time.",{Ok:function(){hide_modal(),j.resolve(!1)}}):j.resolve(!0),$.when(j).then(function(b){if(b){var d=a.map(i,function(a){var b=new l({settings:a,regions:f,mode:c.model.get("default_mode")});return c.add_track(b),b});a.each(d,function(a,b){setTimeout(function(){g.set_input_values(a.get("settings").get("values")),$.when(g.rerun(h,f)).then(function(b){var d=b.first(),f=d.get("track_config");f.dataset=d,f.tool=null,f.prefs=c.config.to_key_value_dict();var g=e.object_from_template(f,c,null);g.init_for_tool_data(),a.set("track",g)})},1e4*b)})}})})}});return{SweepsterVisualization:n,SweepsterVisualizationView:s}});
//# sourceMappingURL=../../maps/viz/sweepster.js.map