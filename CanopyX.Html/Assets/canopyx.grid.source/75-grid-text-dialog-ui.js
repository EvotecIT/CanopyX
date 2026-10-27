  DataGrid.prototype.showReportingText=function(column,text,returnFocus,rowId,mono=false,extra){
    if(this.destroyed||this.pendingQuery||!this.acceptedQuery)return;
    this.reportingText?._cxOverlay.close("replace",false,true);
    const dialog=h("dialog","cx-grid-overlay cx-dialog cx-text-dialog cx-reporting-text"),head=h("div","cx-drawer-h"),title=h("h4"),body=h("div"),content=h("pre",mono?"p-mono":"");
    for(const name of (this.opts.overlayClass||"").split(/\s+/).filter(Boolean))dialog.classList.add(name);
    dialog.dataset.hfxPart="dialog";head.dataset.hfxPart="header";title.dataset.hfxPart="title";body.dataset.hfxPart="body";
    title.id=this.id+"-text-title";title.setAttribute("aria-level","2");setText(title,column.title);dialog.setAttribute("aria-labelledby",title.id);
    const copy=gridDecorateButton(gridButton(this.labels.gridCopy,()=>this.writeClipboard(text).catch(error=>this.emit("error",{error}))),"copy",true);
    const close=gridDecorateButton(gridButton("",()=>dialog._cxOverlay.close()),"close",true);close.classList.add("icon");close.setAttribute("aria-label",this.labels.gridCloseCell);
    setText(content,text);content.hidden=!!extra&&!text;copy.hidden=content.hidden;content.tabIndex=0;head.append(title,copy,close);if(extra)body.append(extra);body.append(content);dialog.append(head,body);
    if(extra?.tagName==="FORM"){
      extra.id=this.id+"-analyst-form";const footer=h("div");footer.dataset.hfxPart="footer";
      const cancel=gridButton(this.labels.cancelEdit,()=>dialog._cxOverlay.close());
      const apply=extra.querySelector('[type="submit"]');apply.setAttribute("form",extra.id);footer.append(cancel,apply);dialog.append(footer);
    }document.body.appendChild(dialog);this.reportingText=dialog;
    const lifetime=new AbortController(),overlay=dialog._cxOverlay=UI_IMPL.dialog(dialog,{host:this.host,container:this.host,focus:false},lifetime.signal);
    const signal=this.dataLifetime.signal,abort=()=>overlay.close("data",false,true);signal.addEventListener("abort",abort,{once:true});
    dialog.addEventListener("close",()=>{lifetime.abort();signal.removeEventListener("abort",abort);dialog.remove();if(this.reportingText===dialog)this.reportingText=null;
      if(!this.reportingText&&!signal.aborted)gridRestoreFocus(this,returnFocus,rowId,column);},{once:true});
    overlay.open();(extra?.querySelector("button,select,input,textarea")||content).focus();
  };
