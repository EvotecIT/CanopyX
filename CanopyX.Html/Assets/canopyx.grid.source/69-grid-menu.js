  function gridMenuFocus(panel,event){
    const items=[...panel.querySelectorAll('[role="menuitem"]')].filter(item=>!item.disabled),index=items.indexOf(document.activeElement);
    if(!items.length)return;
    let next;
    if(["ArrowDown","ArrowUp","Home","End"].includes(event.key))next=event.key==="Home"?0:event.key==="End"?items.length-1:(index+(event.key==="ArrowDown"?1:-1)+items.length)%items.length;
    else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      const now=performance.now();panel._typeAhead=now-(panel._typeAt||0)>700?event.key:panel._typeAhead+event.key;panel._typeAt=now;
      const matches=items.map((_,i)=>(index+i+1)%items.length);next=matches.find(i=>foldText(items[i].textContent.trim()).startsWith(foldText(panel._typeAhead)));
    }else return;
    if(next===undefined)return;event.preventDefault();
    items.forEach((item,i)=>item.tabIndex=i===next?0:-1);items[next].focus({preventScroll:true});
  }
  Object.assign(DataGrid.prototype,{
    openGridPopover(anchor,className,title,columnId){
      this.closeGridPopover(false);
      const panel=h("div","cx-host cx-grid-overlay cx-pop "+className),controller=new AbortController(),signal=controller.signal;
      gridOverlayTheme(this,panel);panel.setAttribute("role","dialog");panel.setAttribute("aria-label",title);panel.tabIndex=-1;
      panel.id=this.id+"-popover";anchor.setAttribute("aria-controls",panel.id);anchor.setAttribute("aria-expanded","true");document.body.appendChild(panel);
      // Other CanopyX menus close; this grid closes the popover on a press, focus or menu event outside it (57-toolbar-panels.js).
      announceMenu(panel);
      const position=()=>{
        const current=this.headCells.find(cell=>cell.dataset.cxColumn===columnId)||anchor,bounds=current.getBoundingClientRect();
        if(panel.classList.toggle("cx-phone",this.host.clientWidth<=640)){panel.style.left="0";panel.style.top="auto";panel.style.bottom="0";panel.style.width="100%";panel.style.maxHeight="80vh";}
        else {panel.style.width="";panel.style.bottom="auto";panel.style.maxHeight=Math.min(500,global.innerHeight-16)+"px";
          panel.style.left=Math.max(8,Math.min(bounds.left,global.innerWidth-panel.offsetWidth-8))+"px";
          panel.style.top=Math.max(8,Math.min(bounds.bottom,global.innerHeight-panel.offsetHeight-8))+"px";}
      };
      this.gridPopover={panel,controller,anchor,columnId,position};
      global.addEventListener("resize",position,{signal});global.addEventListener("scroll",position,{capture:true,signal});
      panel.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();this.closeGridPopover();}else gridMenuFocus(panel,event);},{signal});
      this.lifetime.signal.addEventListener("abort",()=>controller.abort(),{once:true,signal});
      signal.addEventListener("abort",()=>panel.remove(),{once:true});queueMicrotask(position);return panel;
    },
    openColumnMenu(id,anchor){
      const column=this.columns.find(item=>item.id===id),panel=this.openGridPopover(anchor,"cx-column-menu",fill(this.labels.gridColumnMenu,{column:column.title}),id);
      const menu=h("div");menu.setAttribute("role","menu");menu.setAttribute("aria-label",panel.getAttribute("aria-label"));panel.appendChild(menu);
      const icons=new Map([[this.labels.gridSortAscending,"up"],[this.labels.gridSortDescending,"down"],[this.labels.gridFilterColumn,"filter"],[this.labels.gridPinLeft,"pin"],[this.labels.gridPinRight,"pin"],[this.labels.gridFitContent,"fit"],[this.labels.gridHideColumn,"hide"]]);
      const paths={pin:'<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>',fit:'<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3M4 5v14M20 5v14"/>',hide:'<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9 6-.3.8-1.2 2.3-2.6 3.6M6.4 7.6C4.6 8.9 3.4 10.8 3 12c.5 1.5 4 6 9 6 1.6 0 3-.4 4.3-1.1"/>'};
      const add=(label,action,disabled=false)=>{const button=gridButton(label,()=>{this.closeGridPopover(false);Promise.resolve().then(action).catch(error=>this.emit("error",{error}));});
        const icon=h("span","ico"),name=icons.get(label);if(name){icon.appendChild(gridIcon(name,paths[name]));}button.prepend(icon);
        button.classList.add("cx-mi");button.setAttribute("role","menuitem");button.tabIndex=-1;button.disabled=disabled;menu.appendChild(button);};
      const sort=direction=>this.setQuery(gridQueryStart(this.queryForChange(true),{sort:[...(this.queryForChange().sort||[]).filter(item=>item.column!==id),...direction?[{column:id,direction}]:[]]}));
      add(this.labels.gridSortAscending,()=>sort("asc"),!column.sortable||this.view.reporting?.grouping?.column===id);
      add(this.labels.gridSortDescending,()=>sort("desc"),!column.sortable||this.view.reporting?.grouping?.column===id);
      add(this.labels.gridClearSort,()=>sort(null),!(this.getQuery()?.sort||[]).some(item=>item.column===id));
      menu.appendChild(h("hr","cx-menu-rule"));add(this.labels.gridFilterColumn,()=>this.openColumnFilter(id,this.headRow.querySelector('[data-cx-column-menu="'+CSS.escape(id)+'"]')),column.filterable===false);
      menu.appendChild(h("hr","cx-menu-rule"));
      for(const [pin,label]of [["left","gridPinLeft"],["right","gridPinRight"],["none","gridUnpin"]])add(this.labels[label],()=>this.setColumnPinned(id,pin));
      menu.appendChild(h("hr","cx-menu-rule"));add(this.labels.gridFitContent,()=>this.autoFitColumn(id),!this.acceptedQuery||!!this.pendingQuery);
      add(this.labels.gridFitAllColumns,()=>this.autoFitColumns(),!this.acceptedQuery||!!this.pendingQuery);
      add(this.labels.gridHideColumn,()=>this.setColumnVisible(id,false),this.columns.filter(item=>!item.hidden).length===1);
      const first=panel.querySelector('[role="menuitem"]:not(:disabled)');if(first){first.tabIndex=0;first.focus();}
    }
  });
