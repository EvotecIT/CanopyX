  Object.assign(DataGrid.prototype,{
    openGridPopover(anchor,className,title,columnId,createOverlay){
      anchor=this.resolveColumnAnchor(columnId,anchor);if(!anchor)return null;
      this.closeGridPopover(false);
      const panel=h("div","cx-host cx-grid-overlay cx-pop cx-popover "+className),controller=new AbortController(),signal=controller.signal;
      for(const name of (this.opts.overlayClass||"").split(/\s+/).filter(Boolean))panel.classList.add(name);
      panel.dataset.hfxPart="popover";panel.setAttribute("role","dialog");panel.setAttribute("aria-label",title);panel.tabIndex=-1;
      panel.id=this.id+"-popover";anchor.setAttribute("aria-controls",panel.id);anchor.setAttribute("aria-expanded","true");document.body.appendChild(panel);
      // Other CanopyX menus close; this grid closes the popover on a press, focus or menu event outside it (57-toolbar-panels.js).
      const pressed=new Set();let positionPending=false,releaseFrame=0;
      const position=()=>{
        if(signal.aborted)return;
        // Accepted filters can add or remove the query summary above the header. Keep the native press target still
        // through pointerup and its click; moving it between those events loses a checkbox's activation.
        if(pressed.size||releaseFrame){positionPending=true;return;}
        positionPending=false;
        const current=this.resolveColumnAnchor(columnId,anchor,true);
        if(!current){this.closeGridPopover(false);return;}
        const phone=this.host.clientWidth<=640;panel.classList.toggle("cx-phone",phone);panel.dataset.phone=String(phone);
        if(phone){panel.style.margin="0";panel.style.left="0";panel.style.top="auto";panel.style.bottom="0";panel.style.width="100%";panel.style.maxHeight="80vh";}
        else {panel.style.margin="";panel.style.width="";panel.style.bottom="auto";panel.style.maxHeight=Math.min(500,global.innerHeight-16)+"px";
          UI_TOOLS.position(panel,current,"bottom-start");}
      };
      // Position only after a native press completes; accepted filters may move the header before click.
      const overlay=createOverlay?createOverlay(panel,signal):UI_TOOLS.overlay(panel,{host:this.host,trigger:anchor,kind:"popover",initialFocus:panel},signal);
      this.gridPopover={panel,controller,anchor,columnId,position,overlay};
      for(const type of ["cx-popover:close","cx-menu:close"])panel.addEventListener(type,event=>{if(event.target===panel&&this.gridPopover?.panel===panel)this.closeGridPopover(event.detail.reason==="cancel");},{signal});
      panel.addEventListener("pointerdown",event=>pressed.add(event.pointerId),{signal});
      const release=event=>{
        if(!pressed.delete(event.pointerId))return;
        if(!releaseFrame)releaseFrame=global.requestAnimationFrame(()=>{releaseFrame=0;if(positionPending)position();});
      };
      for(const type of ["pointerup","pointercancel"])global.addEventListener(type,release,{capture:true,signal});
      global.addEventListener("resize",position,{signal});global.addEventListener("scroll",position,{capture:true,signal});
      this.lifetime.signal.addEventListener("abort",()=>controller.abort(),{once:true,signal});
      signal.addEventListener("abort",()=>{global.cancelAnimationFrame(releaseFrame);pressed.clear();if(this.gridPopover?.panel===panel)this.gridPopover=null;anchor.setAttribute("aria-expanded","false");panel.remove();},{once:true});
      overlay.open();announceMenu(panel);UI_TOOLS.observe(this.host,position,signal);queueMicrotask(position);return panel;
    },
    async openColumnMenu(id,anchor){
      const request=this.pendingColumnMenu={anchor};
      try{
        await this.requirePart("ui-menu");
        if(this.destroyed||this.pendingColumnMenu!==request)return;
        anchor=this.resolveColumnAnchor(id,anchor);
        if(anchor)UI_IMPL.columnMenu.call(this,id,anchor,{gridIcon,gridQueryStart});
      }catch(error){if(!this.destroyed&&this.pendingColumnMenu===request){this.setNotice(this.labels.gridLoadFailed,true);this.emit("error",{error});}}
      finally{if(this.pendingColumnMenu===request)this.pendingColumnMenu=null;}
    }
  });
