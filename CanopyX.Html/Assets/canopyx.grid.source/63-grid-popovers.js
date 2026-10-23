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
      if(focus){const anchor=open.anchor?.isConnected&&open.anchor.checkVisibility()?open.anchor:this.headRow.querySelector('[data-cx-column-menu="'+CSS.escape(open.columnId||"")+'"]');
        (anchor||this.grid).focus({preventScroll:true});}
    },
    buildColumnMenus(){
      this.headerMenusLifetime?.abort();this.headerMenusLifetime=new AbortController();const signal=this.headerMenusLifetime.signal;
      const clearTouch=()=>this.headCells.forEach(cell=>cell.classList.remove("cx-menu-touched"));
      document.addEventListener("pointerdown",clearTouch,{capture:true,signal});
      for(const cell of this.headCells){
        const id=cell.dataset.cxColumn,column=this.columns.find(item=>item.id===id);
        const filter=gridDecorateButton(gridButton("",()=>this.openColumnFilter(id,filter)),"filter",true),menu=gridDecorateButton(gridButton("",()=>this.openColumnMenu(id,menu)),"more",true);
        filter.classList.add("cx-grid-header-filter","icon");menu.classList.add("cx-grid-column-menu","icon");
        filter.dataset.cxFilterColumn=id;menu.dataset.cxColumnMenu=id;filter.setAttribute("aria-label",this.labels.gridHeaderFilter?fill(this.labels.gridHeaderFilter,{column:column.title}):column.title+": "+this.labels.gridFilterColumn);
        menu.setAttribute("aria-label",fill(this.labels.gridColumnMenu,{column:column.title}));menu.setAttribute("aria-haspopup","menu");menu.setAttribute("aria-expanded","false");
        filter.dataset.cxFiltered=String(gridColumnFiltered(this.acceptedQuery,id));filter.hidden=filter.dataset.cxFiltered!=="true";
        menu.dataset.cxFiltered=filter.dataset.cxFiltered;
        menu.addEventListener("keydown",event=>{if(event.key==="ArrowDown"){event.preventDefault();this.openColumnMenu(id,menu);}},{signal});
        cell.insertBefore(filter,cell.querySelector(".cx-resize"));if(this.tools.columnMenus!==false)cell.insertBefore(menu,cell.querySelector(".cx-resize"));
        if(this.tools.columnMenus!==false){
          let press,timer,held=false;
          const cancel=()=>{global.clearTimeout(timer);press=null;};
          document.addEventListener("pointerdown",cancel,{capture:true,signal});
          const open=event=>{event.preventDefault();event.stopPropagation();if(press)held=true;cancel();if(this.gridPopover?.columnId!==id||!this.gridPopover.panel.classList.contains("cx-column-menu"))this.openColumnMenu(id,menu);};
          cell.addEventListener("pointerdown",event=>{
            cancel();held=false;
            if(event.pointerType!=="touch")return;
            cell.classList.add("cx-menu-touched");
            if(!event.isPrimary||event.button||event.target.closest(".cx-resize,.cx-grid-column-menu,.cx-grid-header-filter,.cx-column-move"))return;
            press={id:event.pointerId,x:event.clientX,y:event.clientY};
            timer=global.setTimeout(()=>{press=null;held=true;this.openColumnMenu(id,menu);},550);
          },{signal});
          global.addEventListener("pointermove",event=>{if(press?.id===event.pointerId&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>8)cancel();},{signal});
          for(const type of ["pointerup","pointercancel"])global.addEventListener(type,event=>{if(press?.id===event.pointerId)cancel();},{signal});
          global.addEventListener("scroll",cancel,{capture:true,signal});
          // A touch release sends a compatibility mousedown: its default focus would close the just-opened menu.
          cell.addEventListener("mousedown",event=>{if(held)event.preventDefault();},{signal});
          cell.addEventListener("click",event=>{if(held){held=false;event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal});
          signal.addEventListener("abort",cancel,{once:true});
          cell.addEventListener("contextmenu",open,{signal});
          cell.addEventListener("keydown",event=>{held=false;cancel();if(event.key==="ContextMenu"||event.shiftKey&&event.key==="F10")open(event);},{signal});
        }
      }
      if(this.gridPopover)this.gridPopover.position();
    }
  });
