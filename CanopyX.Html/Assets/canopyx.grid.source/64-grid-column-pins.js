  const GRID_PIN_PREPARE=DataGrid.prototype.prepareState,GRID_PIN_WIDTHS=DataGrid.prototype.applyWidths,GRID_PIN_CELL=DataGrid.prototype.newCell;
  function gridPinGeometry(grid){
    const budget=Math.max(0,grid.grid.clientWidth-(grid.view.reporting?.minimumCenterWidth||128));
    for(const column of grid.columns)column.effectivePin="none";
    const left=grid.cols.filter(column=>column.pin==="left"),right=grid.cols.filter(column=>column.pin==="right").reverse();
    let used=0;const stopped=[false,false];
    for(let index=0;index<Math.max(left.length,right.length);index++)for(const [side,column]of [left[index],right[index]].entries())if(column&&!stopped[side]){
      if(used+column.renderWidth>budget)stopped[side]=true;else{used+=column.renderWidth;column.effectivePin=column.pin;}}
    let start=0,end=0;
    for(const column of grid.cols){column.pinOffset=column.effectivePin==="left"?start:0;if(column.effectivePin==="left")start+=column.renderWidth;}
    for(const column of [...grid.cols].reverse())if(column.effectivePin==="right"){column.pinOffset=end;end+=column.renderWidth;}
    grid.pinnedLeftWidth=start;grid.pinnedRightWidth=end;
    grid.cols.forEach((column,index)=>grid.applyColumnPin(grid.headCells[index],column));
    for(const row of [...grid.rendered.values(),...grid.pool])if(row._kind==="node")grid.cols.forEach((column,index)=>{if(row.children[index])grid.applyColumnPin(row.children[index],column);});
  }
  DataGrid.prototype.prepareState=function(){for(const column of this.columns)if(column.pin===undefined)column.pin="none";return GRID_PIN_PREPARE.call(this);};
  DataGrid.prototype.applyWidths=function(widths){GRID_PIN_WIDTHS.call(this,widths);if(!this.view.reporting)gridPinGeometry(this);this.syncPinnedShadows();};
  DataGrid.prototype.applyColumnPin=function(cell,column){
    const pin=column.effectivePin||"none";if(pin==="none")cell.removeAttribute("data-cx-pin");else cell.dataset.cxPin=pin;
    cell.style.left=pin==="left"?column.pinOffset+"px":"";cell.style.right=pin==="right"?column.pinOffset+"px":"";
    const side=pin==="left"?this.cols.filter(item=>item.effectivePin==="left").at(-1):this.cols.find(item=>item.effectivePin==="right");
    cell.classList.toggle("cx-pin-edge",side===column);
  };
  DataGrid.prototype.newCell=function(index,width,kind){const cell=GRID_PIN_CELL.call(this,index,width,kind);if(kind&&this.cols[index])this.applyColumnPin(cell,this.cols[index]);return cell;};
  DataGrid.prototype.setColumnPinned=function(id,pin){const column=this.columns.find(item=>item.id===id);
    if(!column||!["none","left","right"].includes(pin)||this.destroyed)throw new Error("CanopyX: invalid column pin.");
    column.pin=pin;this.columns=["left","none","right"].flatMap(side=>this.columns.filter(item=>(item.pin||"none")===side));
    this.buildHeader();this.render();this.syncColumnControls();this.stateChanged();};
  const GRID_PIN_STATE_COLUMN=gridStateColumn,GRID_PIN_STATE_COLUMNS=gridStateColumns;
  gridStateColumn=column=>({...GRID_PIN_STATE_COLUMN(column),pin:column.pin||"none"});
  gridStateColumns=(grid,input)=>{const result=GRID_PIN_STATE_COLUMNS(grid,input),sources=new Map(input.map(column=>[column.id,column]));
    for(const saved of result){const pin=sources.get(saved.id)?.pin||"none";if(!["none","left","right"].includes(pin))throw new Error("CanopyX: invalid saved pin.");saved.pin=pin;}return result;};
