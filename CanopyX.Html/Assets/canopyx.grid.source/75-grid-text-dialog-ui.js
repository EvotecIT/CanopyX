  DataGrid.prototype.showReportingText=function(column,text,returnFocus,rowId,mono=false){
    if(this.destroyed||this.pendingQuery||!this.acceptedQuery)return;
    this.reportingText?.close();
    const dialog=h("dialog","cx-host cx-grid-overlay cx-text-dialog cx-reporting-text"),head=h("div","cx-drawer-h"),title=h("h4"),content=h("pre",mono?"p-mono":"");
    gridOverlayTheme(this,dialog);title.id=this.id+"-text-title";title.setAttribute("aria-level","2");setText(title,column.title);dialog.setAttribute("aria-labelledby",title.id);
    const copy=gridDecorateButton(gridButton(this.labels.gridCopy,()=>this.writeClipboard(text).catch(error=>this.emit("error",{error}))),"copy",true);
    const close=gridDecorateButton(gridButton("",()=>dialog.close()),"close",true);close.classList.add("icon");close.setAttribute("aria-label",this.labels.gridCloseCell);
    setText(content,text);content.tabIndex=0;head.append(title,copy,close);dialog.append(head,content);document.body.appendChild(dialog);this.reportingText=dialog;
    const signal=this.dataLifetime.signal,abort=()=>dialog.close();signal.addEventListener("abort",abort,{once:true});
    dialog.addEventListener("keydown",event=>{
      if(event.key!=="Tab"||event.altKey||event.ctrlKey||event.metaKey)return;
      const controls=[content,copy,close],index=controls.indexOf(document.activeElement);event.preventDefault();
      controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length].focus({preventScroll:true});
    });
    dialog.addEventListener("close",()=>{signal.removeEventListener("abort",abort);dialog.remove();if(this.reportingText===dialog)this.reportingText=null;
      if(!this.reportingText&&!signal.aborted)gridRestoreFocus(this,returnFocus,rowId,column);},{once:true});
    dialog.showModal();content.focus();
  };
