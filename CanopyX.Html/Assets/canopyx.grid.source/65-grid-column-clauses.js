  // ---------- a column's conditions inside a query: read, removed and put back (column filters and the facet panel) ----------
  function gridColumnGroup(operator,items){
    const filters=[],groups=[];
    for(const item of items){
      if(typeof item==="boolean"){if(item===(operator==="or"))return item;continue;}
      if(item.operator===operator){filters.push(...item.filters);groups.push(...item.groups);}
      else(item.groups?groups:filters).push(item);
    }
    return !filters.length&&!groups.length?operator==="and":!filters.length&&groups.length===1?groups[0]:{operator,filters,groups};
  }
  function gridColumnClauses(query,id){
    if(query.tupleFilters?.some(tuple=>tuple.columns.some(field=>field.column===id)))throw new Error("complex");
    const clauses=[],has=group=>group.filters.some(item=>item.column===id)||group.groups.some(has),only=group=>group.filters.every(item=>item.column===id)&&group.groups.every(only);
    const remove=group=>{if(!group)return undefined;if(only(group)){clauses.push(group);return undefined;}
      if(group.operator==="or"&&has(group))throw new Error("complex");
      const filters=group.filters.filter(item=>{if(item.column!==id)return true;clauses.push(item);return false;}),groups=group.groups.map(remove).filter(Boolean);
      if(!filters.length&&!groups.length)return undefined;
      return gridColumnGroup(group.operator,[...filters,...groups]);};
    const filters=(query.filters||[]).filter(item=>{if(item.column!==id)return true;clauses.push(item);return false;}),filterGroup=remove(query.filterGroup);
    return {clauses,query:{...query,filters,filterGroup}};
  }
  function gridInstallColumnClause(query,id,clause){
    const base=gridColumnClauses(query,id).query;
    if(!clause)return gridQueryStart(base);
    if(!clause.groups)return gridQueryStart(base,{filters:[...base.filters,clause]});
    return gridQueryStart(base,{filterGroup:base.filterGroup?gridColumnGroup("and",[base.filterGroup,clause]):clause});
  }
