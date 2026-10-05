  function gridOverlayTheme(grid,element) {
    element.setAttribute("data-cx-theme",grid.host.getAttribute("data-cx-theme"));
    const theme=getComputedStyle(grid.host);
    for (const name of theme) if(name.startsWith("--cx-")) element.style.setProperty(name,theme.getPropertyValue(name));
  }
  function gridRestoreFocus(grid,returnFocus,rowId,column) {
    if(grid.destroyed)return;
    if(returnFocus?.isConnected&&reachable(returnFocus)){returnFocus.focus({preventScroll:true});return;}
    const row=[...grid.rowCache.values()].find(item=>!item.status&&item.key===rowId);
    const index=grid.visibleColumns().findIndex(item=>item.id===column?.id);
    if(row&&index>=0)grid.focusCell(row,index,0);
    else if(row)grid.setFocus(row,true);
    else grid.grid.focus({preventScroll:true});
  }
  DataGrid.prototype.showReportingText=function(column,text,returnFocus,rowId,mono=false){
    if(this.destroyed||this.pendingQuery||!this.acceptedQuery)return;
    this.reportingText?.close();
    const dialog=h("dialog","cx-host cx-grid-overlay cx-text-dialog cx-reporting-text"),head=h("div","cx-drawer-h"),title=h("h4"),content=h("pre",mono?"p-mono":"");
    gridOverlayTheme(this,dialog);title.id=this.id+"-text-title";setText(title,column.title);dialog.setAttribute("aria-labelledby",title.id);
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
      if(!signal.aborted)gridRestoreFocus(this,returnFocus,rowId,column);},{once:true});
    dialog.showModal();content.focus();
  };
