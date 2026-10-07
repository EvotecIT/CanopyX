  function gridColumnClauses(query,id){
    const clauses=[],has=group=>group.filters.some(item=>item.column===id)||group.groups.some(has),only=group=>group.filters.every(item=>item.column===id)&&group.groups.every(only);
    const remove=group=>{if(!group)return undefined;if(only(group)){clauses.push(group);return undefined;}
      if(group.operator==="or"&&has(group))throw new Error("complex");
      const filters=group.filters.filter(item=>{if(item.column!==id)return true;clauses.push(item);return false;}),groups=group.groups.map(remove).filter(Boolean);
      return filters.length||groups.length?{operator:group.operator,filters,groups}:undefined;};
    const filters=(query.filters||[]).filter(item=>{if(item.column!==id)return true;clauses.push(item);return false;}),filterGroup=remove(query.filterGroup);
    return {clauses,query:{...query,filters,filterGroup}};
  }
  function gridInstallColumnClause(query,id,clause){
    const base=gridColumnClauses(query,id).query;
    if(!clause)return gridQueryStart(base);
    if(!clause.groups&&!clause.filters)return gridQueryStart(base,{filters:[...base.filters,clause]});
    return gridQueryStart(base,{filterGroup:base.filterGroup?{operator:"and",filters:[],groups:[base.filterGroup,clause]}:clause});
  }
  Object.assign(DataGrid.prototype,{
    async columnFacetItems(column,search="",signal){
      if(this.view.source.kind==="host")return this.getFacets(column.id,{search,includeCurrentFilter:false,limit:200,signal});
      const query=gridColumnProjection(this.queryForChange(),column.id),columns=new Map(this.view.columns.map(item=>[item.id,item])),rows=gridQueryRows(this.view,query,columns,false),buckets=new Map();
      for(const row of rows){const value=cellValue(row.cells[column.id])??null,key=typeof value+":"+foldText(value),item=buckets.get(key);
        if(item)item.count++;else buckets.set(key,{value,count:1});}
      const items=[...buckets.values()].filter(item=>foldText(item.value).includes(foldText(search)));
      items.sort((a,b)=>a.value===null||b.value===null?(a.value===b.value?0:a.value===null?1:-1):
        gridOrder(typeof a.value,typeof b.value)||gridOrder(foldText(a.value),foldText(b.value)));
      return {items:items.slice(0,200),matched:rows.length,totalValues:items.length,truncated:items.length>200};
    },
    openColumnFilter(id,anchor){
      if(!this.acceptedQuery||this.pendingQuery)return;
      const column=this.columns.find(item=>item.id===id),panel=this.openGridPopover(anchor,"cx-column-filter",column.title+": "+this.labels.gridFilterColumn,id);
      const head=h("div","cx-pop-h"),body=h("div","cx-pop-b"),footer=h("div","cx-pop-f"),error=h("p","cx-grid-control-error");
      setText(head,column.title);error.setAttribute("role","status");panel.append(head,body,error,footer);
      let timer,clauses,base,draft;const signal=this.gridPopover.controller.signal,filters=this.reportingFilters;
      // Edit as text opens the Filters menu; without that menu (toolbar filters off) the chips still remove the condition.
      const complex=()=>{setText(body,this.labels.gridComplexFilter);if(filters)body.appendChild(gridButton(this.labels.gridEditAsText,()=>{this.closeGridPopover(false);filters.details.open=true;}));};
      try{({clauses,query:base}=gridColumnClauses(this.queryForChange(),id));}catch(_){complex();return;}
      const flush=()=>{clearTimeout(timer);timer=null;if(signal.aborted||draft===undefined)return;
        try{const promise=this.setQuery(gridInstallColumnClause(this.queryForChange(true),id,draft));draft=undefined;this.reportingFilterSubmitEpoch=this.queryEpoch;
          promise.then(()=>setText(error,""),failure=>setText(error,failure.message));}catch(failure){setText(error,failure.message);}};
      const apply=clause=>{draft=clause??null;clearTimeout(timer);timer=setTimeout(flush,200);};
      apply.cancel=()=>{clearTimeout(timer);draft=undefined;};
      signal.addEventListener("abort",()=>clearTimeout(timer),{once:true});
      footer.append(gridButton(this.labels.gridClearColumnFilter,()=>{clearTimeout(timer);this.setQuery(gridInstallColumnClause(this.queryForChange(true),id,null)).catch(failure=>this.emit("error",{error:failure}));this.closeGridPopover();}),
        gridButton(this.labels.gridDone,()=>{flush();this.closeGridPopover();}));
      const faceted=column.kind==="text"&&(this.view.source.kind==="inline"||this.view.reporting?.facetColumns?.includes(id)&&typeof this.source.facet==="function");
      if(!faceted&&clauses.some(item=>item.groups&&(item.groups.length||item.filters.length>2))||!faceted&&clauses.length>2)complex();
      else if(faceted)this.renderColumnValues(column,body,clauses,apply,error,signal);else this.renderColumnConditions(column,body,clauses,apply,error);
      this.gridPopover.position();
    },
    async renderColumnValues(column,body,clauses,apply,error,signal){
      const search=h("input","cx-input"),all=h("input"),list=h("div","cx-val-list"),status=h("p","cx-muted");
      search.type="search";search.setAttribute("aria-label",this.labels.gridFilterValues);search.placeholder=this.labels.gridFilterValues;
      all.type="checkbox";all.checked=!clauses.length;const allLabel=h("label","cx-val-all"),allCount=h("span","cx-val-n");allCount.setAttribute("aria-hidden","true");allLabel.append(all,this.labels.gridSelectAllValues,allCount);body.append(search,allLabel,list,status);
      const flatten=group=>group.groups?group.filters.concat(group.groups.flatMap(flatten)):[group],predicates=clauses.flatMap(flatten);
      const criteria=()=>JSON.stringify([gridResultShape(gridColumnProjection(this.getQuery(),column.id)),this.snapshot.revision]),originalCriteria=criteria();
      this.host.addEventListener("canopyx:query",()=>{if(criteria()!==originalCriteria)this.closeGridPopover(false);},{signal});
      let baseAll=!clauses.length,items=[],selected=new Map(),request=0,initial=true,facetController;
      signal.addEventListener("abort",()=>facetController?.abort(),{once:true});
      const key=value=>typeof value+":"+foldText(value),chosen=value=>selected.has(key(value))?selected.get(key(value)):
        !clauses.length||clauses.every(clause=>clause.groups?gridMatchesGroup({cells:{[column.id]:value}},clause,new Map([[column.id,column]])):gridMatches({cells:{[column.id]:value}},clause,column));
      for(const predicate of predicates)if(["in","eq"].includes(predicate.operator))for(const value of predicate.values)selected.set(key(value),true);
      const commit=()=>{
        let clause;if(baseAll){const excluded=items.filter(item=>selected.get(key(item.value))===false);
          const filters=excluded.map(item=>({column:column.id,operator:item.value==null?"isNotNull":"ne",values:item.value==null?[]:[item.value]}));
          if(filters.length)clause={operator:"and",filters,groups:[]};
        }else{const values=[...new Map([...items.filter(item=>chosen(item.value)).map(item=>[key(item.value),item.value]),...predicates.filter(item=>["in","eq"].includes(item.operator)).flatMap(item=>item.values.filter(value=>selected.get(key(value))!==false).map(value=>[key(value),value]))]).values()];
          const filters=[];if(values.some(value=>value==null))filters.push({column:column.id,operator:"isNull",values:[]});
          const raw=values.filter(value=>value!=null);if(raw.length)filters.push({column:column.id,operator:"in",values:raw});
          clause=filters.length?{operator:"or",filters,groups:[]}:{operator:"and",filters:[{column:column.id,operator:"isNull",values:[]},{column:column.id,operator:"isNotNull",values:[]}],groups:[]};}
        apply(clause);
      };
      const render=()=>{list.replaceChildren();for(const item of items){const label=h("label","cx-val"),check=h("input"),value=h("span","cx-facet-value"),count=h("span","cx-val-n");check.type="checkbox";check.checked=chosen(item.value);
          const options=column.presenter||this.view.reporting?.presenters?.[column.id];
          if(options&&!['statusStrip','sparklineBars','sparklineLine','change','identifier','longText','list','tags'].includes(options.kind))gridCellRenderer(this,column,options)({id:"facet",cells:{[column.id]:item.value}},value);else setText(value,cellText(item.value,column,this.fmt)||"—");
          setText(count,numberFormat(this.lang).format(item.count));label.append(check,value,count);list.appendChild(label);
          check.addEventListener("change",()=>{selected.set(key(item.value),check.checked);all.checked=items.every(item=>chosen(item.value));all.indeterminate=!all.checked&&items.some(item=>chosen(item.value));commit();});}
        all.checked=items.length>0&&items.every(item=>chosen(item.value));all.indeterminate=!all.checked&&items.some(item=>chosen(item.value));};
      const load=async()=>{const generation=++request;facetController?.abort();facetController=new AbortController();setText(status,this.labels.loading);
        try{const page=await this.columnFacetItems(column,search.value,facetController.signal);if(signal.aborted||generation!==request)return;
          const previous=new Map(items.map(item=>[key(item.value),item]));for(const item of page.items)previous.set(key(item.value),item);items=[...previous.values()];
          render();for(const row of list.children)row.hidden=!foldText(row.querySelector('.cx-facet-value').textContent).includes(foldText(search.value));
          if(initial&&!search.value){search.hidden=page.totalValues<=12;initial=false;setText(allCount,numberFormat(this.lang).format(page.totalValues));}
          setText(status,page.truncated?fill(this.labels.gridFacetCounts,{count:page.matched,shown:page.items.length,total:page.totalValues}):"");this.gridPopover?.position();
        }catch(failure){if(!signal.aborted&&generation===request&&failure.name!=="AbortError")setText(error,failure.message);}};
      all.addEventListener("change",()=>{baseAll=all.checked;selected.clear();for(const item of items)selected.set(key(item.value),all.checked);render();commit();});
      search.addEventListener("input",load);load();
    }
  });
