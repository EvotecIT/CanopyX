  // Query parsing and matching stay in the core. Optional parts install on first use, from an inert payload in the page
  // or from files beside the runtime: the editor (menus, editors, drawer, selected aggregates) and the export part.
  const GRID_PART_URL=typeof document!=="undefined"&&document.currentScript?.src;
  const FILTER_EDITOR={key:"CanopyXFilterEditor",name:"filter-editor",label:"filter editor",version:"__CX_FILTER_VERSION__",script:"__CX_FILTER_SCRIPT__",style:"__CX_FILTER_STYLE__",
    context:()=>({DataGrid,h,setText,gridButton,gridInputLabel,gridOption,gridScalar,gridQuery,gridQueryStart,
    GRID_FILTER_LABELS,gridResultShape,gridQueryRows,gridOrder,gridColumnProjection,gridCellRenderer,cellValue,cellText,foldText,
    reachable,gridMatchesGroup,gridDecorateButton,gridIcon,numberFormat,fill,
    GRID_REPORTING,reportingRangeRows:typeof reportingRangeRows==="function"?reportingRangeRows:null})};
  function loadGridPart(part){
    return part.ready||=Promise.resolve().then(async()=>{
      if(global[part.key]?.version!==part.version){
        const find=type=>document.querySelector('script[type="application/x-canopyx-'+type+'"][data-cx-version="'+part.version+'"]');
        const payload=find(part.name),script=h("script"),embeddedStyle=part.style&&find("filter-style");
        if(payload){if(embeddedStyle){const style=h("style");setText(style,embeddedStyle.textContent);if(payload.nonce)style.nonce=payload.nonce;document.head.appendChild(style);}
          setText(script,payload.textContent);if(payload.nonce)script.nonce=payload.nonce;document.head.appendChild(script);script.remove();}
        else{
          const runtime=GRID_PART_URL||global.CanopyXFilterEditorBase||document.baseURI,hashed=GRID_PART_URL&&/\.[a-f\d]{16}\.js(?:[?#]|$)/.test(GRID_PART_URL);
          const load=(element,attribute,file,kind)=>new Promise((resolve,reject)=>{element[attribute]=new URL(file,runtime).href;element.onload=resolve;
            element.onerror=()=>{element.remove();reject(new Error("CanopyX: "+part.label+" "+kind+" unavailable."));};document.head.appendChild(element);});
          const link=h("link");link.rel="stylesheet";
          await Promise.all([part.style&&load(link,"href",hashed?part.style:"canopyx-"+part.name+".css","stylesheet"),
            load(script,"src",hashed?part.script:"canopyx-"+part.name+".js","script")]);script.remove();
        }
      }
      if(global[part.key]?.version!==part.version)throw new Error("CanopyX: "+part.label+" and runtime must come from the same build.");
      global[part.key].install(part.context());
    }).catch(error=>{part.ready=null;throw error;});
  }
  function loadGridFilterEditor(){return loadGridPart(FILTER_EDITOR);}
  Object.assign(DataGrid.prototype,{
    buildGridFilters(){
      this.reportingFacetStops=new Set();this.reportingFacetSequence=0;
      if(this.tools.filters===false)return;
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
    try{await loadGridFilterEditor();if(!this.destroyed)this[method](id,anchor?.isConnected?anchor:this.headRow.querySelector('[data-cx-column-menu="'+CSS.escape(id)+'"]'));}
    catch(error){this.setNotice(this.labels.gridLoadFailed,true);this.emit("error",{error});}
  };
