  function gridOverlayTheme(grid,element) {
    element.setAttribute("data-cx-theme",grid.host.getAttribute("data-cx-theme"));
    const theme=getComputedStyle(grid.host);
    element.style.colorScheme=theme.colorScheme;
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
