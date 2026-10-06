  function gridFilterDepth(group){return group?1+Math.max(0,...group.groups.map(gridFilterDepth)):0;}
  function gridFilterSegment(grid,initial,onChange){
    const segment=h("div","cx-seg"),buttons=[];segment.setAttribute("role","group");segment.setAttribute("aria-label",grid.labels.gridFilterMatch);
    segment._operator=initial;
    for(const [value,label]of [["and","gridFilterAll"],["or","gridFilterAny"]]){const button=gridButton(grid.labels[label],()=>{segment._operator=value;sync();onChange();});button.dataset.cxJoin=value;segment.appendChild(button);buttons.push(button);}
    function sync(){for(const button of buttons){button.setAttribute("aria-pressed",String(button.dataset.cxJoin===segment._operator));button.classList.toggle("on",button.dataset.cxJoin===segment._operator);}}
    sync();return segment;
  }
  DataGrid.prototype.renderGridFilters=function(panel){
    panel.replaceChildren();panel.classList.add("cx-fb");this.reportingFilterDraftBase=JSON.stringify([this.queryForChange().filters||[],this.queryForChange().filterGroup||null]);
    const form=h("form","cx-grid-filter-form cx-fb"),head=h("div","cx-pop-h"),body=h("div","cx-pop-b"),footer=h("div","cx-pop-f"),error=h("p","cx-grid-control-error");
    setText(head,this.labels.gridFilters);error.setAttribute("role","status");panel.append(head,form);form.append(body,error,footer);
    panel._filterLifetime?.abort();const controller=panel._filterLifetime=new AbortController();
    let timer,editingText=false,text,draft;
    const flush=()=>{clearTimeout(timer);timer=null;if(!draft||!panel.isConnected||!panel.parentElement.open||this.destroyed)return;
      const query=draft;draft=null;
      try{const validated=gridQuery(this.view,query);if(gridResultShape(validated)===gridResultShape(this.queryForChange()))return;
        const promise=this.setQuery(validated);this.reportingFilterSubmitEpoch=this.queryEpoch;
        promise.then(()=>setText(error,""),failure=>setText(error,failure.message));}catch(failure){setText(error,this.labels.gridInvalidFilter);}};
    const apply=query=>{draft=query;clearTimeout(timer);timer=setTimeout(flush,200);};
    controller.signal.addEventListener("abort",()=>clearTimeout(timer),{once:true});
    this.lifetime.signal.addEventListener("abort",()=>controller.abort(),{once:true,signal:controller.signal});
    // Close open value lists after the click lands: collapsing the inline list moves the controls below it.
    document.addEventListener("click",event=>{for(const box of form.querySelectorAll(".cx-ms[open]"))if(!box.contains(event.target))box.open=false;},{signal:controller.signal});
    form.addEventListener("keydown",event=>{const box=event.target.closest(".cx-ms[open]");if(event.key==="Escape"&&box){box.open=false;box.firstChild.focus();event.stopPropagation();}});
    panel.parentElement.addEventListener("toggle",()=>{if(!panel.parentElement.open)controller.abort();},{signal:controller.signal});
    const close=()=>{clearTimeout(timer);panel.parentElement.open=false;panel.parentElement.querySelector("summary").focus();};
    footer.append(gridButton(this.labels.gridClearFilters,()=>{clearTimeout(timer);this.setQuery(gridQueryStart(this.queryForChange(true),{filters:[],filterGroup:undefined})).catch(failure=>setText(error,failure.message));this.renderGridFilters(panel);}),gridButton(this.labels.gridDone,()=>{draft=gridQueryStart(draft||this.queryForChange(),{search:this.queryForChange(true).search});flush();close();}));
    if(gridFilterDepth(this.queryForChange().filterGroup)>2){
      const notice=h("p");setText(notice,this.labels.gridDeepFilters);text=h("textarea","cx-filter-text");text.setAttribute("aria-label",this.labels.gridFilterText);text.readOnly=true;
      text.value=JSON.stringify({filters:this.queryForChange().filters||[],filterGroup:this.queryForChange().filterGroup},null,2);
      const edit=gridButton(this.labels.gridEditAsText,()=>{editingText=true;text.readOnly=false;text.focus();});body.append(notice,text,edit);
      text.addEventListener("input",()=>{try{const value=JSON.parse(text.value);apply(gridQueryStart(this.queryForChange(true),{filters:value.filters||[],filterGroup:value.filterGroup}));}catch(_){clearTimeout(timer);draft=null;setText(error,this.labels.gridInvalidFilter);}});
      return;
    }
    const update=()=>{try{syncWords(root);apply(readQuery());setText(error,"");}catch(_){clearTimeout(timer);draft=null;setText(error,this.labels.gridInvalidFilter);}};
    const makeGroup=(parent,definition,depth)=>{
      const block=h("div",depth?"cx-group cx-grid-filter-group":"cx-filter-root"),heading=h("div","cx-group-h"),rows=h("div","cx-condition-rows"),children=h("div","cx-grid-filter-group-children"),actions=h("div","cx-adds");
      const segment=gridFilterSegment(this,definition?.operator||"and",update);if(!depth)heading.append(document.createTextNode(this.labels.gridShowRowsWhere+" "));
      heading.append(segment,document.createTextNode(" "+(depth?this.labels.gridOfThese:this.labels.gridOfTheseAreTrue)));
      block._group={segment,rows,children};block.append(heading,rows,children,actions);parent.appendChild(block);
      const add=predicate=>{
        if(form.querySelectorAll('.cx-grid-filter').length>=64)return;
        this.addGridFilter(rows,predicate);const row=rows.lastElementChild;if(!row)return;
        row._design=true;row.classList.add("cx-cond");row._filter.type.closest("label").hidden=row._filter.type.value==="string";const word=h("span","w");row.prepend(word);
        const typeLabel=row._filter.type.closest('label');
        if((this.columns.find(column=>column.id===row._filter.column.value)?.presenter||this.view.reporting?.presenters?.[row._filter.column.value])?.kind==="boolean"){
          row._filter.type.value="boolean";row._filter.type.dispatchEvent(new Event("change"));typeLabel.hidden=true;
        }
        const remove=row.querySelector(':scope > button');if(remove){remove.replaceChildren(gridIcon("close"));remove.classList.add("icon");remove.setAttribute("aria-label",this.labels.gridDeleteCondition);remove.addEventListener("click",update);}
        syncWords(block);return row;
      };
      const condition=gridButton(this.labels.gridAddCondition,()=>{const row=add(null);row?._filter.column.focus();});condition.classList.add("cx-link");
      const group=gridButton(this.labels.gridAddGroup,()=>{makeGroup(children,null,depth+1);syncWords(block);});group.classList.add("cx-link");group.disabled=depth>=2;
      actions.append(condition,group);
      if(depth){const remove=gridDecorateButton(gridButton("",()=>{const target=parent.parentElement.querySelector(":scope > .cx-adds > button");block.remove();update();target?.focus();}),"close",true);remove.classList.add("icon");remove.setAttribute("aria-label",this.labels.gridDeleteFilterGroup);heading.appendChild(remove);}
      const predicates=definition?.filters||[];
      (this.view.reporting&&definition.operator==="and"?reportingRangeRows(predicates):predicates).forEach(add);(definition?.groups||[]).forEach(child=>makeGroup(children,child,depth+1));return block;
    };
    const syncWords=block=>{const data=block._group;[...data.rows.children].forEach((row,index)=>setText(row.querySelector('.w'),index===0?this.labels.gridWhere:data.segment._operator==="and"?this.labels.gridAnd:this.labels.gridOr));
      for(const child of data.children.children)syncWords(child);};
    const readBlock=block=>{const {segment,rows,children}=block._group,filters=[],groups=[...children.children].map(readBlock).filter(Boolean);
      for(const row of rows.children){if(!row._filter.original&&!row._filter.edited)continue;const predicates=[].concat(this.readGridFilter(row));
        if(segment._operator==="or"&&predicates.length>1)groups.push({operator:"and",filters:predicates,groups:[]});else filters.push(...predicates);}
      return filters.length||groups.length?{operator:segment._operator,filters,groups}:null;};
    const readQuery=()=>{
      if(editingText){const value=JSON.parse(text.value);return gridQueryStart(this.queryForChange(true),{filters:value.filters||[],filterGroup:value.filterGroup});}
      const value=readBlock(root);if(!value)return gridQueryStart(this.queryForChange(true),{filters:[],filterGroup:undefined});
      if(value.operator==="or")return gridQueryStart(this.queryForChange(true),{filters:[],filterGroup:value});
      return gridQueryStart(this.queryForChange(true),{filters:value.filters,filterGroup:value.groups.length===1?value.groups[0]:value.groups.length?{operator:"and",filters:[],groups:value.groups}:undefined});
    };
    const root=makeGroup(body,{operator:"and",filters:this.queryForChange().filters||[],groups:this.queryForChange().filterGroup?[this.queryForChange().filterGroup]:[]},0);
    syncWords(root);form.addEventListener("input",update);form.addEventListener("change",update);form.addEventListener("submit",event=>{event.preventDefault();update();});
  };
