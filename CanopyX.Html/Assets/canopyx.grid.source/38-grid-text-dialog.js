  function gridOverlayTheme(grid,element) {
    for (const name of (grid.opts.overlayClass || "").split(/\s+/).filter(Boolean)) element.classList.add(name);
    overlayTheme(grid.host, element);
  }
  function gridRestoreFocus(grid,returnFocus,rowId,column,openedFrom=returnFocus) {
    if(grid.destroyed)return;
    const active=document.activeElement;
    // A queued close event must not undo a later keyboard move or a focus choice made by the host.
    if(active&&active!==document.body&&active!==document.documentElement&&active!==openedFrom&&active!==returnFocus&&reachable(active))return;
    if(returnFocus?.isConnected&&reachable(returnFocus)){returnFocus.focus({preventScroll:true});return;}
    const row=[...grid.rowCache.values()].find(item=>!item.status&&item.key===rowId);
    const index=grid.visibleColumns().findIndex(item=>item.id===column?.id);
    if(row&&index>=0)grid.focusCell(row,index,0);
    else if(row)grid.setFocus(row,true);
    else grid.grid.focus({preventScroll:true});
  }
