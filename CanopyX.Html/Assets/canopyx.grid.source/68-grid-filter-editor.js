  // Query parsing and matching stay in the core. The editor part (menus, editors, drawer, selected aggregates) and the export
  // part install on first use through the runtime's part loader (82-parts.js).
  const FILTER_EDITOR=definePart(DataGrid,"filter-editor","filter editor",()=>({DataGrid,h,setText,gridButton,gridInputLabel,gridOption,gridScalar,gridDateInputMoment,gridQuery,gridQueryStart,
    GRID_FILTER_LABELS,gridResultShape,gridQueryRows,gridOrder,gridKeyCompare,gridFacetKey,columnNumericTone,columnValueTone,gridColumnProjection,gridCellRenderer,cellValue,cellText,foldText,
    reachable,gridMatchesGroup,gridDecorateButton,gridIcon,numberFormat,numberText,fill,announceMenu,applyTone,toneOf,badgeElement,isCellObject,RECORD_IMPL,
    GRID_REPORTING,overlayTheme,UI_IMPL,UI_TOOLS,reportingRangeRows:typeof reportingRangeRows==="function"?reportingRangeRows:null}));
  function loadGridFilterEditor(){return loadPart(FILTER_EDITOR);}
  DataGrid.prototype.requirePart=requirePart;
  Object.assign(DataGrid.prototype,{
    buildGridFilters(){
      this.reportingFacetStops=new Set();this.reportingFacetSequence=0;
      if(this.tools.filters===false||!this.columns.some(column=>column.filterable!==false))return;
      this.reportingFilters=this.controlPanel(this.labels.gridFilters,"cx-grid-filters",panel=>this.renderGridFilters(panel));
    },
    async renderGridFilters(panel){
      const epoch=this.queryEpoch;
      setText(panel,this.labels.loading);
      try{await loadGridFilterEditor();if(epoch!==this.queryEpoch){panel.parentElement.open=false;return;}if(!this.destroyed&&panel.isConnected&&panel.parentElement.open){this.renderGridFilters(panel);this.controlFlyouts.forEach(item=>item.position());}}
      catch(error){if(!this.destroyed&&panel.isConnected){setText(panel,this.labels.gridLoadFailed);panel.appendChild(gridButton(this.labels.gridRetry,()=>this.renderGridFilters(panel)));this.emit("error",{error});}}
    },
    async showReportingText(...args){const epoch=this.queryEpoch;try{await loadGridFilterEditor();if(!this.destroyed&&epoch===this.queryEpoch)this.showReportingText(...args);}catch(error){this.emit("error",{error});}},
  });
  for(const method of ["openColumnMenu","openColumnFilter"])DataGrid.prototype[method]=async function(id,anchor){
    const request=this.pendingColumnMenu={anchor};
    try{await loadGridFilterEditor();if(!this.destroyed&&this.pendingColumnMenu===request){const target=this.resolveColumnAnchor(id,anchor);if(target)this[method](id,target);}}
    catch(error){if(!this.destroyed&&this.pendingColumnMenu===request){this.setNotice(this.labels.gridLoadFailed,true);this.emit("error",{error});}}
    finally{if(this.pendingColumnMenu===request)this.pendingColumnMenu=null;}
  };
