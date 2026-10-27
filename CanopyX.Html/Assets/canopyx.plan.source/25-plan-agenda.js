  // Phone presentation uses the same accepted tasks and resource order as the timeline.
  Object.assign(DataGrid.prototype, {
    planPaintAgenda(network) {
      const groups = this.tlTree.rows.filter(row => !row.status).map(row => ({ id:row.key, label:this.calResourceName(row.key), items:[] }));
      for (const task of this.calEvents) {
        if (task.background) continue;
        const node = network.nodes.get(task.key), critical = this.view.plan.criticalPath !== false && network.complete && node?.critical;
        const dates = this.calFmt.longDay(this.calZone.day(task.start)) + " – " + this.calFmt.longDay(this.calZone.day(task.end));
        const meta = [this.planText("planDependencies") + ": " + (node?.before.length || 0), critical ? this.planText("planCritical") : null,
          node?.before.some(edge => edge.conflict) ? this.planText("planConflict") : null, planMilestone(this, task) ? this.planText("planMilestone") : null].filter(Boolean).join(" · ");
        for (const group of groups) if (this.calEventResources(task).includes(group.id)) group.items.push({ task, dates, meta, critical });
      }
      const active = this.planAgenda?.contains(document.activeElement) ? document.activeElement.dataset.cxPlanRecord : null;
      this.planAgenda?.remove(); this.planAgenda = planAgendaTemplate(groups, this.calLabels); this.calBody.appendChild(this.planAgenda);
      for (const button of this.planAgenda.querySelectorAll("[data-cx-plan-record]")) {
        const task = this.calEvents.find(item => item.key === button.dataset.cxPlanRecord);
        button._calEvent = { ...task, resource:button.dataset.cxPlanResource };
        button.addEventListener("click", () => this.calOpenEvent(button._calEvent, false, button).catch(error => this.emit("error", { error })));
      }
      if (active) [...this.planAgenda.querySelectorAll("button")].find(button => button.dataset.cxPlanRecord === active)?.focus({ preventScroll:true });
    }
  });
