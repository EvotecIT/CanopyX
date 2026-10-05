  // Query parsing and matching stay in the core; the optional editor installs only when opened.
  const FILTER_EDITOR_VERSION="__CX_FILTER_VERSION__",FILTER_EDITOR_SCRIPT="__CX_FILTER_SCRIPT__",FILTER_EDITOR_STYLE="__CX_FILTER_STYLE__";
  const FILTER_RUNTIME_URL=typeof document!=="undefined"&&document.currentScript?.src;
  let filterEditorReady;
  function gridFilterEditorContext(){return {DataGrid,h,setText,setAttr,gridButton,gridInputLabel,gridOption,gridScalar,gridQuery,gridQueryStart,
    GRID_FILTER_LABELS,gridResultShape,gridOperationActive,gridQueryRows,gridOrder,gridColumnProjection,gridCellRenderer,cellValue,cellText,isCellObject,foldText,
    gridOverlayTheme,gridRestoreFocus,gridColumnFiltered,gridMatches,gridMatchesGroup,gridDecorateButton,gridIcon,numberFormat,fill,PROTOCOL,MAX_PROTOCOL_INTEGER};}
  function loadGridFilterEditor(){
    if(filterEditorReady)return filterEditorReady;
    filterEditorReady=Promise.resolve().then(async()=>{
      if(global.CanopyXFilterEditor?.version!==FILTER_EDITOR_VERSION){
        const payload=document.querySelector('script[type="application/x-canopyx-filter-editor"][data-cx-version="'+FILTER_EDITOR_VERSION+'"]');
        const script=h("script"),style=h("style"),embeddedStyle=document.querySelector('script[type="application/x-canopyx-filter-style"][data-cx-version="'+FILTER_EDITOR_VERSION+'"]');
        if(payload){if(embeddedStyle){setText(style,embeddedStyle.textContent);if(payload.nonce)style.nonce=payload.nonce;document.head.appendChild(style);}
          setText(script,payload.textContent);if(payload.nonce)script.nonce=payload.nonce;document.head.appendChild(script);script.remove();}
        else{
          const runtime=FILTER_RUNTIME_URL||global.CanopyXFilterEditorBase||document.baseURI,hashed=FILTER_RUNTIME_URL&&/\.[a-f\d]{16}\.js(?:[?#]|$)/.test(FILTER_RUNTIME_URL);
          const link=h("link");link.rel="stylesheet";link.href=new URL(hashed?FILTER_EDITOR_STYLE:"canopyx-filter-editor.css",runtime).href;
          script.src=new URL(hashed?FILTER_EDITOR_SCRIPT:"canopyx-filter-editor.js",runtime).href;
          await Promise.all([new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=()=>{link.remove();reject(new Error("CanopyX: filter editor stylesheet unavailable."));};document.head.appendChild(link);}),
            new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error("CanopyX: filter editor script unavailable."));};document.head.appendChild(script);})]);script.remove();
        }
      }
      if(global.CanopyXFilterEditor?.version!==FILTER_EDITOR_VERSION)throw new Error("CanopyX: filter editor and runtime must come from the same build.");
      global.CanopyXFilterEditor.install(gridFilterEditorContext());
    }).catch(error=>{filterEditorReady=null;throw error;});return filterEditorReady;
  }
  Object.assign(DataGrid.prototype,{
    buildGridFilters(){
      this.reportingFacetStops=new Set();this.reportingFacetSequence=0;
      this.reportingFilters=this.controlPanel(this.labels.gridFilters,"cx-grid-filters",panel=>this.renderGridFilters(panel));
      this.reportingFilters.panel.id=this.id+"-filters";
    },
    async renderGridFilters(panel){
      const epoch=this.queryEpoch;
      setText(panel,this.labels.loading);
      try{await loadGridFilterEditor();if(epoch!==this.queryEpoch){panel.parentElement.open=false;return;}if(!this.destroyed&&panel.isConnected&&panel.parentElement.open){this.renderGridFilters(panel);this.controlFlyouts.forEach(item=>item.position());}}
      catch(error){if(!this.destroyed&&panel.isConnected){setText(panel,this.labels.gridLoadFailed);panel.appendChild(gridButton(this.labels.gridRetry,()=>this.renderGridFilters(panel)));this.emit("error",{error});}}
    },
    async showReportingText(...args){const epoch=this.queryEpoch;try{await loadGridFilterEditor();if(!this.destroyed&&epoch===this.queryEpoch)this.showReportingText(...args);}catch(error){this.emit("error",{error});}},
    async openColumnMenu(id,anchor){
      try{await loadGridFilterEditor();if(!this.destroyed)this.openColumnMenu(id,anchor?.isConnected?anchor:this.headRow.querySelector('[data-cx-column-menu="'+CSS.escape(id)+'"]'));}
      catch(error){this.setNotice(this.labels.gridLoadFailed,true);this.emit("error",{error});}
    },
    async openColumnFilter(id,anchor){
      try{await loadGridFilterEditor();if(!this.destroyed)this.openColumnFilter(id,anchor?.isConnected?anchor:this.headRow.querySelector('[data-cx-column-menu="'+CSS.escape(id)+'"]'));}
      catch(error){this.setNotice(this.labels.gridLoadFailed,true);this.emit("error",{error});}
    }
  });
