  function gridMenuFocus(panel,event){
    if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
    const items=[...panel.querySelectorAll('[role="menuitem"]')].filter(item=>!item.disabled),index=items.indexOf(document.activeElement);
    if(!items.length)return;event.preventDefault();
    const next=event.key==="Home"?0:event.key==="End"?items.length-1:(index+(event.key==="ArrowDown"?1:-1)+items.length)%items.length;
    items.forEach((item,i)=>item.tabIndex=i===next?0:-1);items[next].focus({preventScroll:true});
  }
  Object.assign(DataGrid.prototype,{
    openGridPopover(anchor,className,title,columnId){
      this.closeGridPopover(false);
      const panel=h("div","cx-host cx-grid-overlay cx-pop "+className),controller=new AbortController(),signal=controller.signal;
      gridOverlayTheme(this,panel);panel.setAttribute("role","dialog");panel.setAttribute("aria-label",title);panel.tabIndex=-1;
      panel.id=this.id+"-popover";anchor.setAttribute("aria-controls",panel.id);anchor.setAttribute("aria-expanded","true");document.body.appendChild(panel);
      const position=()=>{
        const current=this.headCells.find(cell=>cell.dataset.cxColumn===columnId)||anchor,bounds=current.getBoundingClientRect();
        panel.classList.toggle("cx-phone",this.host.clientWidth<=640);
        if(this.host.clientWidth<=640){panel.style.left="0";panel.style.top="auto";panel.style.bottom="0";panel.style.width="100%";panel.style.maxHeight="80vh";}
        else {panel.style.width="";panel.style.bottom="auto";panel.style.maxHeight=Math.min(500,global.innerHeight-16)+"px";
          panel.style.left=Math.max(8,Math.min(bounds.left,global.innerWidth-panel.offsetWidth-8))+"px";
          panel.style.top=Math.max(8,Math.min(bounds.bottom,global.innerHeight-panel.offsetHeight-8))+"px";}
      };
      this.gridPopover={panel,controller,anchor,columnId,position};
      global.addEventListener("resize",position,{signal});global.addEventListener("scroll",position,{capture:true,signal});
      document.addEventListener("pointerdown",event=>{if(!panel.contains(event.target)&&!anchor.contains(event.target))this.closeGridPopover(false);},{signal});
      panel.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();this.closeGridPopover();}else gridMenuFocus(panel,event);},{signal});
      this.lifetime.signal.addEventListener("abort",()=>controller.abort(),{once:true,signal});
      signal.addEventListener("abort",()=>panel.remove(),{once:true});queueMicrotask(position);return panel;
    },
    openColumnMenu(id,anchor){
      const column=this.columns.find(item=>item.id===id),panel=this.openGridPopover(anchor,"cx-column-menu",fill(this.labels.gridColumnMenu,{column:column.title}),id);
      panel.setAttribute("role","menu");
      const add=(label,action,disabled=false)=>{const button=gridButton(label,()=>{this.closeGridPopover(false);Promise.resolve().then(action).catch(error=>this.emit("error",{error}));});
        button.classList.add("cx-mi");button.setAttribute("role","menuitem");button.tabIndex=-1;button.disabled=disabled;panel.appendChild(button);};
      const sort=direction=>this.setQuery(gridQueryStart(this.queryForChange(true),{sort:[...(this.queryForChange().sort||[]).filter(item=>item.column!==id),...direction?[{column:id,direction}]:[]]}));
      add(this.labels.gridSortAscending,()=>sort("asc"),!column.sortable||this.view.reporting?.grouping?.column===id);
      add(this.labels.gridSortDescending,()=>sort("desc"),!column.sortable||this.view.reporting?.grouping?.column===id);
      add(this.labels.gridClearSort,()=>sort(null),!(this.getQuery()?.sort||[]).some(item=>item.column===id));
      panel.appendChild(h("hr","cx-menu-rule"));add(this.labels.gridFilterColumn,()=>this.openColumnFilter(id,this.headRow.querySelector('[data-cx-column-menu="'+CSS.escape(id)+'"]')));
      panel.appendChild(h("hr","cx-menu-rule"));
      for(const [pin,label]of [["left","gridPinLeft"],["right","gridPinRight"],["none","gridUnpin"]])add(this.labels[label],()=>this.setColumnPinned(id,pin));
      panel.appendChild(h("hr","cx-menu-rule"));add(this.labels.gridFitContent,()=>this.autoFitColumn(id),!this.acceptedQuery||!!this.pendingQuery);
      add(this.labels.gridFitAllColumns,()=>this.autoFitColumns(),!this.acceptedQuery||!!this.pendingQuery);
      add(this.labels.gridHideColumn,()=>this.setColumnVisible(id,false),this.columns.filter(item=>!item.hidden).length===1);
      const first=panel.querySelector('[role="menuitem"]:not(:disabled)');if(first){first.tabIndex=0;first.focus();}
    }
  });
