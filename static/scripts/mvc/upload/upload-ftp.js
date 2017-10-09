define(["utils/utils"],function(a){return Backbone.View.extend({initialize:function(a){this.model=new Backbone.Model({cls:"upload-ftp",class_add:"upload-icon-button fa fa-square-o",class_remove:"upload-icon-button fa fa-check-square-o",class_partial:"upload-icon-button fa fa-minus-square-o",help_enabled:!0,help_text:"This Galaxy server allows you to upload files via FTP. To upload some files, log in to the FTP server at <strong>"+a.ftp_upload_site+"</strong> using your Galaxy credentials.",collection:null,onchange:function(){},onadd:function(){},onremove:function(){}}).set(a),this.collection=this.model.get("collection"),this.setElement(this._template()),this.$content=this.$(".upload-ftp-content"),this.$wait=this.$(".upload-ftp-wait"),this.$help=this.$(".upload-ftp-help"),this.$number=this.$(".upload-ftp-number"),this.$disk=this.$(".upload-ftp-disk"),this.$body=this.$(".upload-ftp-body"),this.$warning=this.$(".upload-ftp-warning"),this.$select=this.$(".upload-ftp-select-all"),this.render()},render:function(){var a=this;this.$wait.show(),this.$content.hide(),this.$warning.hide(),this.$help.hide(),$.ajax({url:Galaxy.root+"api/remote_files",method:"GET",success:function(b){a.model.set("ftp_files",b),a._index(),a._renderTable()},error:function(){a._renderTable()}})},_renderTable:function(){var b=this,c=this.model.get("ftp_files");if(this.rows=[],c&&c.length>0){this.$body.empty();var d=0;_.each(c,function(a){b.rows.push(b._renderRow(a)),d+=a.size}),this.$number.html(c.length+" files"),this.$disk.html(a.bytesToString(d,!0)),this.collection&&(this.$("._has_collection").show(),this.$select.addClass(this.model.get("class_add")).off().on("click",function(){b._all()}),this._refresh()),this.$content.show()}else this.$warning.show();this.model.get("help_enabled")&&this.$help.show(),this.$wait.hide()},_renderRow:function(a){var b=this,c=this.model.attributes,d=$(this._templateRow(a)),e=d.find(".icon");if(this.$body.append(d),this.collection){var f=this.ftp_index[a.path];e.addClass(void 0===f?c.class_add:c.class_remove),d.on("click",function(){b._switch(e,a),b._refresh()})}else d.on("click",function(){c.onchange(a)});return e},_index:function(){var a=this;this.ftp_index={},this.collection&&this.collection.each(function(b){"ftp"==b.get("file_mode")&&(a.ftp_index[b.get("file_path")]=b.id)})},_all:function(){var a=this.model.attributes,b=this.model.get("ftp_files"),c=this.$select.hasClass(a.class_add);for(var d in b){var e=b[d],f=this.ftp_index[e.path];(void 0===f&&c||void 0!==f&&!c)&&this._switch(this.rows[d],e)}this._refresh()},_switch:function(a,b){a.removeClass();var c=this.model.attributes,d=this.ftp_index[b.path];if(void 0===d){var e=c.onadd(b);a.addClass(c.class_remove),this.ftp_index[b.path]=e}else c.onremove(d),a.addClass(c.class_add),this.ftp_index[b.path]=void 0},_refresh:function(){var a=_.reduce(this.ftp_index,function(a,b){return void 0!==b&&a++,a},0);this.$select.removeClass(),this.$select.addClass(0==a?this.model.get("class_add"):this.model.get(a==this.rows.length?"class_remove":"class_partial"))},_templateRow:function(b){return'<tr class="upload-ftp-row"><td class="_has_collection" style="display: none;"><div class="icon"/></td><td class="ftp-name">'+_.escape(b.path)+'</td><td class="ftp-size">'+a.bytesToString(b.size)+'</td><td class="ftp-time">'+b.ctime+"</td></tr>"},_template:function(){return'<div class="'+this.model.get("cls")+'"><div class="upload-ftp-wait fa fa-spinner fa-spin"/><div class="upload-ftp-help">'+this.model.get("help_text")+'</div><div class="upload-ftp-content"><span style="whitespace: nowrap; float: left;">Available files: </span><span style="whitespace: nowrap; float: right;"><span class="upload-icon fa fa-file-text-o"/><span class="upload-ftp-number"/>&nbsp;&nbsp;<span class="upload-icon fa fa-hdd-o"/><span class="upload-ftp-disk"/></span><table class="grid" style="float: left;"><thead><tr><th class="_has_collection" style="display: none;"><div class="upload-ftp-select-all"></th><th>Name</th><th>Size</th><th>Created</th></tr></thead><tbody class="upload-ftp-body"/></table></div><div class="upload-ftp-warning warningmessage">Your FTP directory does not contain any files.</div>'}})});
//# sourceMappingURL=../../../maps/mvc/upload/upload-ftp.js.map