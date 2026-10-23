  function gridOverlayTheme(grid,element) {
    for (const name of (grid.opts.overlayClass || "").split(/\s+/).filter(Boolean)) element.classList.add(name);
    overlayTheme(grid.host, element);
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
