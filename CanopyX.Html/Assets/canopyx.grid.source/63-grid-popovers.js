  function gridColumnFiltered(query,id){
    const has=group=>group&&(group.filters.some(item=>item.column===id)||group.groups.some(has));
    return !!query&&(query.filters.some(item=>item.column===id)||!!has(query.filterGroup));
  }
  function gridColumnProjection(query,id){
    const project=group=>{if(!group)return undefined;
      const filters=group.filters.filter(item=>item.column!==id),groups=group.groups.map(project);
      if(group.operator==="or"&&(filters.length!==group.filters.length||groups.some(child=>!child)))return undefined;
      const children=groups.filter(Boolean);return filters.length||children.length?{operator:group.operator,filters,groups:children}:undefined;};
    return {...query,filters:(query.filters||[]).filter(item=>item.column!==id),filterGroup:project(query.filterGroup)};
  }
  Object.assign(DataGrid.prototype,{
    closeGridPopover(focus=true){
      const open=this.gridPopover;if(!open)return;this.gridPopover=null;open.controller.abort();open.panel.remove();open.anchor?.setAttribute("aria-expanded","false");
      if(focus){const anchor=open.anchor?.isConnected?open.anchor:this.headRow.querySelector('[data-cx-column-menu="'+CSS.escape(open.columnId||"")+'"]');
        (anchor||this.grid).focus({preventScroll:true});}
    },
    buildColumnMenus(){
      this.headerMenusLifetime?.abort();this.headerMenusLifetime=new AbortController();const signal=this.headerMenusLifetime.signal;
      for(const cell of this.headCells){
        const id=cell.dataset.cxColumn,column=this.columns.find(item=>item.id===id);
        const filter=gridDecorateButton(gridButton("",()=>this.openColumnFilter(id,filter)),"filter",true),menu=gridDecorateButton(gridButton("",()=>this.openColumnMenu(id,menu)),"more",true);
        filter.classList.add("cx-grid-header-filter","icon");menu.classList.add("cx-grid-column-menu","icon");
        filter.dataset.cxFilterColumn=id;menu.dataset.cxColumnMenu=id;filter.setAttribute("aria-label",this.labels.gridHeaderFilter?fill(this.labels.gridHeaderFilter,{column:column.title}):column.title+": "+this.labels.gridFilterColumn);
        menu.setAttribute("aria-label",fill(this.labels.gridColumnMenu,{column:column.title}));menu.setAttribute("aria-haspopup","menu");menu.setAttribute("aria-expanded","false");
        filter.dataset.cxFiltered=String(gridColumnFiltered(this.acceptedQuery,id));filter.hidden=!gridColumnFiltered(this.acceptedQuery,id)&&!this.view.reporting?.headerFilters;
        menu.addEventListener("keydown",event=>{if(event.key==="ArrowDown"){event.preventDefault();this.openColumnMenu(id,menu);}},{signal});
        cell.insertBefore(filter,cell.querySelector(".cx-resize"));cell.insertBefore(menu,cell.querySelector(".cx-resize"));
      }
      if(this.gridPopover)this.gridPopover.position();
    }
  });
