  const PLAN_PRINT = DataGrid.prototype.tlPrint;
  DataGrid.prototype.tlPrint = function (on) {
    if (!this.view.plan) return PLAN_PRINT.call(this, on);
    this.tlPrintView?.remove(); this.tlPrintView = null;
    if (!on || this.calView !== "timeline" || !this.tlTree) return;
    const view = this.tlPrintView = h("div", "cx-tl-print cx-plan-print"), network = this.planAnalyze();
    const table = h("table"), caption = h("caption"); caption.textContent = this.view.label; table.appendChild(caption);
    const head = h("tr");
    for (const label of [this.cal.title.title, this.calLabels.calendarResources, this.planText("planActual"), this.planText("planBaselineLabel"), this.planText("planCritical"), this.planText("planDependencies")]) {
      const cell = h("th"); cell.textContent = label; head.appendChild(cell);
    }
    const thead = h("thead"); thead.appendChild(head); table.appendChild(thead);
    const body = h("tbody"), ids = new Set(this.tlTree.rows.filter(row => !row.status).map(row => row.key));
    for (const node of network.nodes.values()) {
      const task = node.task;
      if (!ids.has(task.resource)) continue;
      const row = h("tr"), spec = this.view.plan, date = value => Number.isFinite(value) ? new Date(value).toISOString() : "";
      const baseline = spec.baselineStart ? date(planInstant(task.row.cells[spec.baselineStart])) + " – " + date(planInstant(task.row.cells[spec.baselineEnd])) : "";
      const dependencies = node.before.map(edge => edge.conflict ? this.planText("planDependencyConflict", { task: edge.from.task.title }) : edge.from.task.title).join(", ");
      const values = [(planMilestone(this, task) ? "◆ " : "") + task.title + (planMilestone(this, task) ? " (" + this.planText("planMilestone") + ")" : ""), this.calResourceName(task.resource), date(task.start) + " – " + date(task.end), baseline,
        network.complete ? this.view.plan.criticalPath !== false && node.critical ? this.planText("planCritical") : "" : this.planText("planIncomplete"), dependencies];
      for (const value of values) { const cell = h("td"); cell.textContent = value; row.appendChild(cell); }
      if (node.before.some(edge => edge.conflict)) row.classList.add("cx-plan-conflict");
      body.appendChild(row);
    }
    table.appendChild(body); view.appendChild(table); this.tlRoot.appendChild(view);
  };
