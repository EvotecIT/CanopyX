  function gridDateInput(value,local){const date=new Date(value);return Number.isFinite(date.getTime())?new Date(date.getTime()-(local?date.getTimezoneOffset()*60000:0)).toISOString().slice(0,-1):"";}
  const GRID_DATE_PRESETS=[["today","gridToday"],["yesterday","gridYesterday"],["last7","gridLastSevenDays"],["last30","gridLastThirtyDays"],["month","gridThisMonth"]];
  function gridDatePreset(local,preset){
    const start=new Date(),end=new Date(),zone=local?"":"UTC",
      get=(date,part)=>date["get"+zone+part](),set=(date,part,...values)=>date["set"+zone+part](...values),shift=(date,days)=>set(date,"Date",get(date,"Date")+days);
    set(start,"Hours",0,0,0,0);set(end,"Hours",0,0,0,0);shift(end,1);
    if(preset==="yesterday"){shift(start,-1);shift(end,-1);}else if(preset==="last7")shift(start,-6);else if(preset==="last30")shift(start,-29);
    else if(preset==="month"){set(start,"Date",1);end.setTime(start.getTime());set(end,"Month",get(end,"Month")+1,1);}
    return [start.toISOString(),end.toISOString()];
  }
  DataGrid.prototype.renderColumnConditions=function(column,body,clauses,apply,error){
    const rows=h("div","cx-column-conditions"),join=h("select","cx-input"),date=column.kind==="datetime",text=column.kind==="text";
    join.append(gridOption("and",this.labels.gridAnd),gridOption("or",this.labels.gridOr));join.setAttribute("aria-label",this.labels.gridFilterMatch||this.labels.gridOperator);join.hidden=true;
    const filters=clauses.flatMap(item=>item.groups?item.filters:item),original=clauses.find(item=>item.groups);if(original)join.value=original.operator;
    let preset;
    const read=()=>{const predicates=[...rows.children].map(row=>{const {operator,input,original}=row._condition;
      if(["isNull","isNotNull"].includes(operator.value))return {column:column.id,operator:operator.value,values:[]};
      if(original&&input.value===original.input&&operator.value===original.filter.operator)return original.filter;
      const moment=date?gridDateInputMoment(input.value,this.local):null;
      if(date&&!moment)throw new Error(this.labels.gridInvalidFilter);
      const value=column.kind==="number"?Number(input.value):date?moment.toISOString():input.value;
      if(column.kind==="number"&&!input.value.trim())throw new Error(this.labels.gridInvalidFilter);gridScalar(value,column);
      return {column:column.id,operator:operator.value,values:[value]};});
      return predicates.length===1?predicates[0]:{operator:join.value,filters:predicates,groups:[]};};
    const update=()=>{apply.cancel();try{apply(read());setText(error,"");if(preset)preset.value="range";}catch(failure){setText(error,this.labels.gridInvalidFilter);}};
    const add=filter=>{
      if(rows.children.length>=2)return;const row=h("div","cx-column-condition"),operator=h("select","cx-input"),input=h("input","cx-input");
      for(const value of text?["contains","eq","ne","startsWith","isNull","isNotNull"]:["eq","ne","gt","ge","lt","le","isNull","isNotNull"])operator.appendChild(gridOption(value,this.labels[GRID_FILTER_LABELS[value]]||GRID_FILTER_LABELS[value]));
      for(const name of new Set([...this.plugins.flatMap(plugin=>Object.keys(plugin.filterOperators||{})),filter?.operator].filter(Boolean)))
        if(![...operator.options].some(option=>option.value===name))operator.appendChild(gridOption(name,GRID_FILTER_LABELS[name]||name));
      operator.setAttribute("aria-label",this.labels.gridOperator);input.setAttribute("aria-label",this.labels.gridConditionValue);input.type=date?"datetime-local":text?"text":"number";if(!text)input.step="any";
      if(filter){operator.value=filter.operator;input.value=date?gridDateInput(filter.values[0],this.local):String(filter.values[0]??"");}
      input.disabled=["isNull","isNotNull"].includes(operator.value);row._condition={operator,input,original:filter?{filter,input:input.value}:null};
      row.append(operator,input);if(rows.children.length){const remove=gridDecorateButton(gridButton("",()=>{row.remove();join.hidden=true;addButton.hidden=false;update();}),"close",true);
        remove.setAttribute("aria-label",this.labels.gridDeleteCondition);row.appendChild(remove);rows.appendChild(row);}else rows.appendChild(row);
      input.addEventListener("input",update);operator.addEventListener("change",()=>{input.disabled=["isNull","isNotNull"].includes(operator.value);update();});
    };
    if(date){preset=h("select","cx-input");preset.setAttribute("aria-label",this.labels.gridDateRange);
      for(const [value,label]of [["range","gridDateRange"],...GRID_DATE_PRESETS])preset.appendChild(gridOption(value,this.labels[label]));
      preset.addEventListener("change",()=>{if(preset.value==="range")return;const [start,end]=gridDatePreset(this.local,preset.value);
        rows.replaceChildren();add({column:column.id,operator:"ge",values:[start]});add({column:column.id,operator:"lt",values:[end]});join.value="and";join.hidden=false;addButton.hidden=true;apply(read());});body.appendChild(preset);}
    const addButton=gridButton(this.labels.gridAddCondition,()=>{add(null);join.hidden=false;addButton.hidden=true;rows.lastElementChild.querySelector('input').focus();});addButton.classList.add("cx-link");
    add(filters[0]);if(filters[1]){add(filters[1]);join.hidden=false;addButton.hidden=true;}
    join.addEventListener("change",update);body.append(rows,join,addButton);
    if(date){const zone=h("p","cx-muted");setText(zone,new Intl.DateTimeFormat(this.lang,{timeZone:this.local?undefined:"UTC"}).resolvedOptions().timeZone);body.appendChild(zone);}
  };
