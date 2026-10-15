  // One "+N" affordance per first cell on phones. Rows are repainted while detached from the document (row recycling),
  // so the button is kept by its cell, not by isConnected; a renderer's fresh cell receives the same button.
  // Column fitting reserves the button's width in that cell (33-grid-column-fit.js).
  DataGrid.prototype.hiddenFieldCount=function(){return this.columns.filter(item=>item.hidden||item.responsiveHidden||item.fitHidden).length;};
  DataGrid.prototype.paintHiddenFields=function(slot,row,column){
    let button=slot.hiddenFields;
    const count=this.phone&&column===this.cols[0]&&this.hiddenFieldCount();
    if(!count){button?.remove();slot.hiddenFields=null;return;}
    if(!button){button=gridButton("",()=>Promise.resolve().then(()=>this.openDetails(button.dataset.cxRecord)).catch(error=>this.emit("error",{error})));button.classList.add("cx-hidden-fields");button.tabIndex=-1;}
    if(button.parentNode!==slot.cell)slot.cell.appendChild(button);
    button.dataset.cxRecord=row.id;button.setAttribute("aria-label",this.labels.gridDetails);setText(button,"+"+count);
    slot.hiddenFields=button;
  };
