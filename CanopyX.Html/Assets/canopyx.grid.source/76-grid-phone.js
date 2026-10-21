  // One "+N" affordance per first cell on phones. Rows are repainted while detached from the document (row recycling),
  // so the button is kept by its cell, not by isConnected; a renderer's fresh cell receives the same button.
  // Column fitting reserves the button's width in that cell (33-grid-column-fit.js).
  DataGrid.prototype.hiddenViewColumns=function(){return this.columns.filter(item=>!item.hidden&&(item.responsiveHidden||item.fitHidden));};
  DataGrid.prototype.hiddenFieldCount=function(){return this.hiddenViewColumns().length;};
  DataGrid.prototype.hiddenFieldLabel=function(){return "+"+this.hiddenFieldCount()+" "+this.labels.columns;};
  DataGrid.prototype.paintHiddenFields=function(slot,row,column){
    if(this.phone&&column.identity)slot.cell.title=cellText(row.cells[column.id],column,this.fmt)||"";
    let button=slot.hiddenFields;
    const count=this.phone&&column===this.cols[0]&&this.hiddenFieldCount();
    if(!count){button?.remove();slot.hiddenFields=null;return;}
    if(!button){button=gridButton("",()=>Promise.resolve().then(()=>this.openDetails(button.dataset.cxRecord)).catch(error=>this.emit("error",{error})));button.classList.add("cx-hidden-fields");button.tabIndex=-1;}
    if(button.parentNode!==slot.cell)slot.cell.appendChild(button);
    const label=this.hiddenFieldLabel(), titles=this.hiddenViewColumns().map(item=>item.title).join(", ");
    button.dataset.cxRecord=row.id;button.setAttribute("aria-label",label+": "+titles);button.title=titles;setText(button,label);
    slot.hiddenFields=button;
  };
