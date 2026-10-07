  // One "+N" affordance per first cell on phones. Rows are repainted while detached from the document (row recycling),
  // so the button is kept by its cell, not by isConnected; a renderer's fresh cell receives the same button.
  DataGrid.prototype.paintHiddenFields=function(slot,row,column){
    let button=slot.hiddenFields;
    const count=this.phone&&column===this.cols[0]&&this.columns.filter(item=>item.hidden||item.responsiveHidden||item.fitHidden).length;
    if(!count){button?.remove();slot.hiddenFields=null;return;}
    if(!button){button=gridButton("",()=>Promise.resolve().then(()=>this.openDetails(button.dataset.cxRecord)).catch(error=>this.emit("error",{error})));button.classList.add("cx-hidden-fields");button.tabIndex=-1;}
    if(button.parentNode!==slot.cell)slot.cell.appendChild(button);
    button.dataset.cxRecord=row.id;button.setAttribute("aria-label",this.labels.gridDetails);setText(button,"+"+count);
    slot.hiddenFields=button;
  };
