  // State chrome leaves accepted records in place during a request or error.
  Object.assign(DataGrid.prototype,{
    setNotice(text,error){
      clearTimeout(this.gridLoadingTimer);this.notice.replaceChildren();this.notice.hidden=true;this.host.insertBefore(this.notice,this.grid);
      if(!this.stateCleanup){this.stateCleanup=true;this.lifetime.signal.addEventListener("abort",()=>{clearTimeout(this.gridLoadingTimer);clearTimeout(this.gridSkeletonTimer);},{once:true});}
      this.notice.className="cx-grid-notice";this.notice.setAttribute("role",error?"alert":"status");
      if(this.pendingQuery&&!error){
        const epoch=this.queryEpoch;this.gridLoadingTimer=setTimeout(()=>{
          if(this.destroyed||epoch!==this.queryEpoch||!this.pendingQuery)return;
          setText(this.live,this.labels.loading);
          if(!this.snapshot){this.notice.classList.add("cx-initial-skeleton");this.notice.hidden=false;this.host.insertBefore(this.notice,this.grid.nextSibling);
            for(let index=0;index<6;index++){const row=h("div","cx-skel");row.setAttribute("aria-hidden","true");
              for(const column of this.visibleColumns()){const cell=h("span"),bar=h("i");cell.style.flex=column.renderWidth||column.width;cell.appendChild(bar);row.appendChild(cell);}this.notice.appendChild(row);}}
        },150);return;
      }
      if(error){
        this.notice.classList.add("cx-banner");const message=h("div"),title=h("b"),detail=h("span","d");
        setText(title,this.labels.gridLoadFailed);setText(detail,text);message.append(title,document.createTextNode(" "),detail);
        const retry=gridDecorateButton(gridButton(this.labels.gridRetry,()=>this.retry().catch(()=>{})),"retry",true);retry.classList.add("cx-grid-retry");
        this.notice.append(message,retry);this.notice.hidden=false;setText(this.live,this.labels.gridLoadFailed+" "+text);return;
      }
      if(this.snapshot&&(this.cursor?this.cursorWindow.end===this.pageOffset:this.snapshot.matched===0)){
        const query=this.acceptedQuery,active=!!query.search||gridFilterCount(query)>0,title=h("h4"),reason=h("p"),actions=h("div","acts");
        this.notice.classList.add("cx-state");this.host.insertBefore(this.notice,this.grid.nextSibling);title.setAttribute("aria-level","2");setText(title,fill(active?this.labels.gridNoMatches:this.labels.gridEmpty,{noun:this.noun}));
        setText(reason,active?fill(this.labels.gridNoMatchesReason,{search:query.search||"—",count:gridFilterCount(query)}):this.view.emptyReason||this.labels.gridEmptyReason);
        if(active)actions.appendChild(gridButton(this.labels.gridClearAll,()=>this.setQuery(gridQueryStart(this.queryForChange(true),{search:"",filters:[],filterGroup:undefined})).catch(()=>{})));
        this.notice.append(title,reason,actions);this.notice.hidden=false;setText(this.live,title.textContent+" "+reason.textContent);
      }else if(text){setText(this.notice,text);this.notice.hidden=false;}
    },
    paintGridSkeleton(element,row){
      if(row.status!=="loading"){element._skeleton?.remove();element._skeleton=null;return;}
      row.loadingAt??=performance.now();const wait=150-(performance.now()-row.loadingAt);
      if(wait>0){if(!this.gridSkeletonTimer)this.gridSkeletonTimer=setTimeout(()=>{this.gridSkeletonTimer=null;if(!this.destroyed){this.version++;this.scheduleRender();}},wait);return;}
      const cell=element._cells[0].cell;element._cells[0].text.data="";
      if(element._skeleton?.isConnected)return;
      const skeleton=element._skeleton=h("span","cx-skel");skeleton.setAttribute("aria-hidden","true");
      for(const column of this.cols){const span=h("span"),bar=h("i");span.style.width=column.renderWidth+"px";span.appendChild(bar);skeleton.appendChild(span);}cell.appendChild(skeleton);
    },
    buildGridStatus(){
      if(!this.view.statusBar)return;this.statusBar=h("div","cx-grid-status");this.statusCount=h("span");this.statusAggregates=h("span","agg");
      this.statusBar.setAttribute("role","status");this.statusBar.append(this.statusCount,this.statusAggregates);this.host.appendChild(this.statusBar);
    },
    async syncGridStatus(){
      if(!this.statusBar)return;const count=this.querySelection?this.querySelection.matched==null?null:Math.max(0,this.querySelection.matched-this.selectionExcluded.size):this.selected.size;
      const number=numberFormat(this.lang);gridCountLabel(this.statusCount,this.labels.gridStatusCount,{count:this.snapshot?.matched==null?"—":number.format(this.snapshot.matched),noun:this.noun,selected:count==null?"—":number.format(count)});
      const columns=this.columns.filter(column=>column.aggregatable),key=JSON.stringify([this.queryEpoch,this.snapshot?.revision,count,[...this.selected],this.querySelection?.query,[...(this.selectionExcluded||[])],columns.map(column=>column.id)]);
      if(key===this.statusAggregateKey)return;this.statusAggregateKey=key;this.statusAggregateController?.abort();this.statusAggregates.replaceChildren();
      if(!columns.length||count===0||!this.acceptedQuery)return;
      try{await loadGridFilterEditor();if(!this.destroyed&&this.statusAggregateKey===key)await this.calculateGridAggregates(columns);}
      catch(error){if(!this.destroyed&&this.statusAggregateKey===key)setText(this.statusAggregates,this.labels.gridNoData);}
    }
  });
