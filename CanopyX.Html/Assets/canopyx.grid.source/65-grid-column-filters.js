  Object.assign(DataGrid.prototype,{
    columnFacetItems(column,search="",signal){
      if(!column||column.filterable===false)throw new Error("CanopyX: facets require a filterable column.");
      if(this.view.source.kind==="host")return this.getFacets(column.id,{search,includeCurrentFilter:false,limit:200,signal});
      const query=gridColumnProjection(this.queryForChange(false,true),column.id),columns=new Map(this.view.columns.map(item=>[item.id,item])),rows=gridQueryRows(this.view,query,columns,false),buckets=new Map();
      for(const row of rows){const value=cellValue(row.cells[column.id])??null,key=gridFacetKey(value,column),item=buckets.get(key);
        if(item)item.count++;else buckets.set(key,{value,count:1});}
      const items=[...buckets.values()].filter(item=>foldText(cellText(item.value,column,this.fmt)).includes(foldText(search)));
      items.sort((a,b)=>a.value===null||b.value===null?(a.value===b.value?0:a.value===null?1:-1):
        column.valueOrder?.length?gridKeyCompare(a.value,b.value,column,"asc"):gridOrder(typeof a.value,typeof b.value)||gridOrder(foldText(a.value),foldText(b.value)));
      return {items:items.slice(0,200),matched:rows.length,totalValues:items.length,truncated:items.length>200};
    },
    openColumnFilter(id,anchor){
      if(!this.acceptedQuery||this.pendingQuery)return;
      const column=this.columns.find(item=>item.id===id);
      if(!column||column.filterable===false)throw new Error("CanopyX: column filters require a filterable column.");
      const panel=this.openGridPopover(anchor,"cx-column-filter",column.title+": "+this.labels.gridFilterColumn,id);
      const head=h("div","cx-pop-h"),body=h("div","cx-pop-b"),footer=h("div","cx-pop-f"),error=h("p","cx-grid-control-error");
      setText(head,column.title);error.setAttribute("role","status");panel.append(head,body,error,footer);
      let timer,clauses,draft;const signal=this.gridPopover.controller.signal,filters=this.reportingFilters;
      // Edit as text opens the Filters menu; without that menu (toolbar filters off) the chips still remove the condition.
      const complex=()=>{setText(body,this.labels.gridComplexFilter);if(filters)body.appendChild(gridButton(this.labels.gridEditAsText,()=>{this.closeGridPopover(false);filters.details.open=true;}));};
      try{({clauses}=gridColumnClauses(this.queryForChange(),id));}catch(_){complex();return;}
      const flush=()=>{clearTimeout(timer);timer=null;if(signal.aborted||draft===undefined)return;
        try{const promise=this.setQuery(gridInstallColumnClause(this.queryForChange(true),id,draft));draft=undefined;this.reportingFilterSubmitEpoch=this.queryEpoch;
          promise.then(()=>setText(error,""),failure=>setText(error,failure.message));}catch(failure){setText(error,failure.message);}};
      const apply=clause=>{draft=clause??null;clearTimeout(timer);timer=setTimeout(flush,200);};
      apply.cancel=()=>{clearTimeout(timer);draft=undefined;};
      signal.addEventListener("abort",()=>clearTimeout(timer),{once:true});
      footer.append(gridButton(this.labels.gridClearColumnFilter,()=>{clearTimeout(timer);this.setQuery(gridInstallColumnClause(this.queryForChange(true),id,null)).catch(failure=>this.emit("error",{error:failure}));this.closeGridPopover();}),
        gridButton(this.labels.gridDone,()=>{flush();this.closeGridPopover();}));
      const custom=item=>item.groups?item.filters.some(custom)||item.groups.some(custom):!Object.hasOwn(GRID_FILTER_LABELS,item.operator);
      const faceted=!clauses.some(custom)&&column.kind==="text"&&(this.view.source.kind==="inline"||this.view.reporting?.facetColumns?.includes(id)&&typeof this.source.facet==="function");
      if(!faceted&&clauses.some(item=>item.groups&&(item.groups.length||item.filters.length>2))||!faceted&&clauses.length>2)complex();
      else if(faceted)this.renderColumnValues(column,body,clauses,apply,error,signal);else this.renderColumnConditions(column,body,clauses,apply,error);
      this.gridPopover.position();
    },
    renderColumnValues(column,body,clauses,apply,error,signal){
      const search=h("input","cx-input"),all=h("input"),list=h("div","cx-val-list"),status=h("p","cx-muted");
      search.type="search";search.setAttribute("aria-label",this.labels.gridFilterValues);search.placeholder=this.labels.gridFilterValues;
      all.type="checkbox";all.checked=!clauses.length;const allLabel=h("label","cx-val-all"),allCount=h("span","cx-val-n");allCount.setAttribute("aria-hidden","true");allLabel.append(all,this.labels.gridSelectAllValues,allCount);body.append(search,allLabel,list,status);
      const criteria=()=>JSON.stringify([gridResultShape(gridColumnProjection(this.getQuery(),column.id)),this.snapshot.revision]),originalCriteria=criteria();
      this.host.addEventListener("canopyx:query",()=>{if(criteria()!==originalCriteria)this.closeGridPopover(false);},{signal});
      let baseline=gridColumnGroup("and",clauses),items=[],selected=new Map(),request=0,facetController;
      signal.addEventListener("abort",()=>facetController?.abort(),{once:true});
      const key=value=>gridFacetKey(value,column),columns=new Map([[column.id,column]]),
        matchesClause=(value,clause)=>typeof clause==="boolean"?clause:gridMatchesGroup({cells:{[column.id]:value}},clause,columns),
        predicate=(operator,values=[])=>({column:column.id,operator,values}),matches=value=>matchesClause(value,baseline),
        chosen=value=>selected.get(key(value))?.checked??matches(value);
      const syncAll=()=>{all.checked=items.length>0&&items.every(item=>chosen(item.value));all.indeterminate=!all.checked&&items.some(item=>chosen(item.value));};
      const commit=()=>{
        // Facet pages are bounded. Keep the original predicate for unseen values, then apply only explicit checkbox edits.
        // Prior point overrides are irrelevant for the edited values. Remove them before adding the new ones so
        // reopening and toggling a value does not accumulate nested groups or duplicate predicates.
        const withoutEdited=clause=>{
          if(clause.groups)return gridColumnGroup(clause.operator,[...clause.filters,...clause.groups].map(withoutEdited));
          if(clause.operator==="in"){const values=clause.values.filter(value=>!selected.has(key(value)));return values.length?{...clause,values}:false;}
          if(["eq","ne","isNull","isNotNull"].includes(clause.operator)&&selected.has(key(clause.values[0]??null)))return ["ne","isNotNull"].includes(clause.operator);
          return clause;
        };
        let clause=typeof baseline==="boolean"?baseline:withoutEdited(baseline);
        const included=[],excluded=[];
        for(const item of selected.values())if(item.checked!==matchesClause(item.value,clause))(item.checked?included:excluded).push(item.value);
        clause=gridColumnGroup("and",[clause,...excluded.map(value=>predicate(value==null?"isNotNull":"ne",value==null?[]:[value]))]);
        const additions=[],raw=included.filter(value=>value!=null);if(raw.length<included.length)additions.push(predicate("isNull"));
        if(raw.length)additions.push(predicate("in",raw));
        clause=gridColumnGroup("or",[clause,...additions]);
        apply(clause===true?undefined:clause===false?gridColumnGroup("and",[predicate("isNull"),predicate("isNotNull")]):clause);
      };
      const render=()=>{list.replaceChildren();for(const item of items){const label=h("label","cx-val"),check=h("input"),value=h("span","cx-facet-value"),count=h("span","cx-val-n");check.type="checkbox";check.checked=chosen(item.value);
          const options=column.presenter;
          if(options&&!['statusStrip','sparklineBars','sparklineLine','change','identifier','longText','list','tags'].includes(options.kind))gridCellRenderer(this,column,options)({id:"facet",cells:{[column.id]:item.value}},value);else setText(value,cellText(item.value,column,this.fmt)||"—");
          setText(count,numberFormat(this.lang).format(item.count));label.append(check,value,count);list.appendChild(label);
          check.addEventListener("change",()=>{if(check.checked===matches(item.value))selected.delete(key(item.value));else selected.set(key(item.value),{value:item.value,checked:check.checked});syncAll();commit();});}
        syncAll();};
      const load=async()=>{const generation=++request;facetController?.abort();facetController=new AbortController();setText(status,this.labels.loading);
        try{const page=await this.columnFacetItems(column,search.value,facetController.signal);if(signal.aborted||generation!==request)return;
          const previous=new Map(items.map(item=>[key(item.value),item]));for(const item of page.items)previous.set(key(item.value),item);items=[...previous.values()];
          render();for(const row of list.children)row.hidden=!foldText(row.querySelector('.cx-facet-value').textContent).includes(foldText(search.value));
          if(!search.value){search.hidden=page.totalValues<=12;setText(allCount,numberFormat(this.lang).format(page.totalValues));}
          setText(status,page.truncated?fill(this.labels.gridFacetCounts,{count:page.matched,shown:page.items.length,total:page.totalValues}):"");this.gridPopover?.position();
        }catch(failure){if(!signal.aborted&&generation===request&&failure.name!=="AbortError")setText(error,failure.message);}};
      all.addEventListener("change",()=>{baseline=all.checked;selected.clear();render();commit();});
      search.addEventListener("input",load);load();
    }
  });
