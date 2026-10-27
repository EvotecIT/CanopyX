  // Phone records are indexed once per accepted model, then rendered in bounded local pages.
  const PLAN_AGENDA_PAGE=50;
  Object.assign(DataGrid.prototype, {
    planPaintAgenda(network) {
      if(!this.calPhone) {this.planAgenda?.remove();this.planAgenda=this.planAgendaState=this.planAgendaModel=null;return;}
      let state=this.planAgendaState;
      if(!state) {
        state=this.planAgendaState=planAgendaTemplate(this.labels);this.planAgenda=state.root;
        state.previous.addEventListener("click",()=>{--state.page;this.planPaintAgendaPage();});
        state.next.addEventListener("click",()=>{++state.page;this.planPaintAgendaPage();});
      }
      if(state.root.parentNode!==this.calBody) this.calBody.appendChild(state.root);
      const old=this.planAgendaModel;
      if(old?.events===this.calEvents&&old.rows===this.tlTree.rows&&old.network===network) {this.planFitAgendaHeight();return;}
      const groups=this.tlTree.rows.filter(row=>!row.status).map(row=>({id:row.key,label:this.calResourceName(row.key),row,expandable:this.tlTree.expandable(row),items:[]})),index=new Map(groups.map(group=>[group.id,group]));
      for(const task of this.calEvents) {
        if(task.background) continue;
        const node=network.nodes.get(task.key),critical=this.view.plan.criticalPath!==false&&network.complete&&node?.critical,milestone=planMilestone(this,task);
        const start=this.calFmt.longDay(this.calZone.day(task.start)),dates=milestone?start:start+" – "+this.calFmt.longDay(this.calZone.day(task.end));
        const meta=[this.planText("planDependencies")+": "+(node?.before.length||0),critical?this.planText("planCritical"):null,
          node&&[...node.before,...node.after].some(edge=>edge.conflict)?this.planText("planConflict"):null,milestone?this.planText("planMilestone"):null].filter(Boolean).join(" · ");
        for(const id of this.calEventResources(task)) {const group=index.get(id);if(group) group.items.push({kind:"task",group,task,dates,meta,critical});}
      }
      const items=groups.flatMap(group=>[{kind:"resource",group},...group.items]);
      this.planAgendaModel={events:this.calEvents,rows:this.tlTree.rows,network,items,index};
      state.page=old?.events===this.calEvents?Math.min(state.page,Math.max(0,Math.ceil(items.length/PLAN_AGENDA_PAGE)-1)):0;
      this.planStart();this.planPaintAgendaPage();
    },
    planPaintAgendaPage() {
      const state=this.planAgendaState,model=this.planAgendaModel;if(!state||!model)return;
      const active=state.list.contains(document.activeElement)?document.activeElement:null,record=active?.dataset.cxPlanRecord,resource=active?.dataset.cxPlanResource,toggle=active?.dataset.cxPlanToggle;
      const pages=Math.max(1,Math.ceil(model.items.length/PLAN_AGENDA_PAGE));state.page=Math.max(0,Math.min(pages-1,state.page));
      state.list.replaceChildren(planAgendaPageTemplate(model.items.slice(state.page*PLAN_AGENDA_PAGE,(state.page+1)*PLAN_AGENDA_PAGE),this.view.plan.proposeMoves));
      for(const button of state.list.querySelectorAll("[data-cx-plan-toggle]")) button.addEventListener("click",()=>{
        const row=model.index.get(button.dataset.cxPlanToggle)?.row;this.tlTree.toggle(row).catch(error=>this.emit("error",{error}));
      });
      state.previous.disabled=state.page===0;state.next.disabled=state.page===pages-1;state.pager.hidden=pages===1;
      setText(state.position,this.labels.gridPageNumber+" "+(state.page+1)+" / "+pages);
      state.scroll.scrollTop=0;
      const target=[...state.list.querySelectorAll("button")].find(button=>record?button.dataset.cxPlanRecord===record&&button.dataset.cxPlanResource===resource:toggle&&button.dataset.cxPlanToggle===toggle);
      if(target)target.focus({preventScroll:true});this.planFitAgendaHeight();
    },
    planFitAgendaHeight() {
      const state=this.planAgendaState;if(!state)return;
      const css=getComputedStyle(state.root),padding=parseFloat(css.paddingTop)+parseFloat(css.paddingBottom);
      this.planFitHeight(state.list.getBoundingClientRect().height+padding+(state.pager.hidden?0:state.pager.getBoundingClientRect().height));
    }
  });
