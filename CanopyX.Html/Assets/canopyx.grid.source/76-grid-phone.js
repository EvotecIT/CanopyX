  DataGrid.prototype.paintHiddenFields=function(slot,row,column){
    let button=slot.hiddenFields;
    if(!this.phone||column!==this.cols[0]){button?.remove();slot.hiddenFields=null;return;}
    const count=this.columns.filter(item=>item.hidden||item.responsiveHidden).length;
    if(!count){button?.remove();slot.hiddenFields=null;return;}
    if(button&&!button.isConnected)button=null;
    if(!button){button=gridButton("",()=>Promise.resolve().then(()=>this.openDetails(button.dataset.cxRecord)).catch(error=>this.emit("error",{error})));button.classList.add("cx-hidden-fields");button.tabIndex=-1;slot.cell.appendChild(button);}
    button.dataset.cxRecord=row.id;button.setAttribute("aria-label",this.labels.gridDetails);setText(button,"+"+count);
    slot.hiddenFields=button;
  };
