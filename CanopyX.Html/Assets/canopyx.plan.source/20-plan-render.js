  const PLAN_LABELS = {
    planMilestone: "Milestone", planCritical: "Critical path", planBaseline: "Baseline: {start} – {end}",
    planDependency: "{from} finishes before {to} starts", planDependencyConflict: "Dependency conflict with {task}",
    planOverlapConflict: "Overlaps {task}", planIncomplete: "The complete task network is unavailable; the host must check this proposal.",
    planInvalidRange: "The task must finish at or after its start.", planInvalidResource: "Choose a task resource.",
    planProposal: "Proposed {task}: {start} – {end}", planMoveHint: "Alt+Left or Alt+Right proposes a new date; Alt+Up or Alt+Down proposes a resource.",
    planConflict: "Conflict", planActual: "Actual", planPending: "Proposal awaiting the host", planBaselineLabel: "Baseline", planDependencies: "Dependencies"
  };
  const PLAN_EVENT = DataGrid.prototype.calEventElement;
  DataGrid.prototype.calEventElement = function (event, kind) {
    const element = PLAN_EVENT.call(this, event, kind);
    if (this.view.plan && kind === "lane") {
      this.planDecorate(element, event);
      this.planStart();
    }
    return element;
  };
  const PLAN_LANES = DataGrid.prototype.tlPaintLanes;
  DataGrid.prototype.tlPaintLanes = function (...args) {
    const result = PLAN_LANES.apply(this, args);
    if (this.view.plan && this.tlCanvas && this.calView === "timeline") this.planPaint();
    return result;
  };
  Object.assign(DataGrid.prototype, {
    planDecorate(element, event) {
      const network = this.planAnalyze(), node = network.nodes.get(event.key), labels = [this.calEventName(event)];
      const milestone = planMilestone(this, event), critical = this.view.plan.criticalPath !== false && network.complete && node?.critical;
      planTaskTemplate.call(this, element, event, node, labels, milestone, critical, this.view.plan.proposeMoves);
    },
    planPaint() {
      this.tlRoot.classList.add("cx-plan");
      this.host.classList.add("cx-plan-host"); this.calRoot.classList.add("cx-plan-calendar");
      if (!this.planLegend) {
        const legend = this.planLegend = planLegendTemplate.call(this);
        this.calBody.before(legend);
        this.lifetime.signal.addEventListener("abort", () => { legend.remove(); this.host.classList.remove("cx-plan-host"); }, { once: true });
      }
      const network = this.planAnalyze(), axis = this.tlAxis, positions = new Map(), canvasBox = this.tlCanvas.getBoundingClientRect();
      for (const lane of this.tlLanes.values()) {
        for (const previous of lane.querySelectorAll(".cx-plan-baseline")) previous.remove();
        for (const element of lane.querySelectorAll(".cx-plan-task")) {
          const task = element._calEvent;
          // The timeline positions markers after event creation; this pass gives explicit milestones their point shape too.
          if (planMilestone(this, task)) element.style.width = "0px";
          const spec = this.view.plan;
          if (spec.baselineStart) {
            element._planHeight ??= Number.parseFloat(element.style.height);
            if (!planMilestone(this, task)) element.style.height = Math.max(PLAN_METRICS.actualMinHeight, element._planHeight - PLAN_METRICS.actualBaselineGap) + "px";
          }
          const rect = element.getBoundingClientRect(), start = axis.x(task.tlStart), end = axis.x(planMilestone(this, task) ? task.tlStart : task.tlEnd);
          if (!positions.has(task.key)) positions.set(task.key, { start, end, y: rect.top - canvasBox.top + rect.height / 2, bottom: rect.bottom - canvasBox.top });
          const title = element.querySelector(".cx-cal-ev-title");
          if (title) { title.title = task.title; element.classList.toggle("cx-plan-label-outside", title.scrollWidth > element.clientWidth - 12 || planMilestone(this, task)); }
          if (!spec.baselineStart || !spec.baselineEnd) continue;
          const from = planInstant(task.row.cells[spec.baselineStart]), to = planInstant(task.row.cells[spec.baselineEnd]);
          if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || from >= axis.to || to < axis.from) continue;
          const text = this.planText("planBaseline", { start: this.calFmt.longDay(this.calZone.day(from)), end: this.calFmt.longDay(this.calZone.day(to)) });
          planBaselineTemplate(element, lane, axis, from, to, text);
          // Baselines are also spoken on the actual task button rather than adding a non-cell to the ARIA grid.
          element._planName ||= element.getAttribute("aria-label"); element.setAttribute("aria-label", element._planName + "; " + text);
        }
      }
      const svg = planLinksTemplate(axis, this.tlCanvas.style.height);
      for (const edge of network.edges) {
        const from = positions.get(edge.from.task.key), to = positions.get(edge.to.task.key);
        if (!from || !to) continue;
        const tight = Math.abs(edge.from.early + edge.from.task.end - edge.from.task.start + edge.lag - edge.to.early) < 1;
        const critical = this.view.plan.criticalPath !== false && network.complete && edge.from.critical && edge.to.critical && tight;
        planLinkTemplate.call(this, svg, axis, from, to, edge, critical, this.planText("planDependency", { from: edge.from.task.title, to: edge.to.task.title }));
      }
      this.planLinks?.remove(); this.planLinks = svg; this.tlCanvas.appendChild(svg);
      this.tlRoot.dataset.cxPlanComplete = String(network.complete);
      this.tlRoot.style.height = ((this.tlTree.tops[this.tlTree.rows.length] || 0) + this.tlHead.offsetHeight + 2) + "px";
      this.tlHead.querySelector(".cx-plan-today")?.remove();
      const now = Date.now();
      if (this.cal.now && now >= axis.from && now < axis.to) {
        const label = h("span", "cx-plan-today"); setText(label, this.calLabels.calendarToday);
        label.style.insetInlineStart = axis.x(now) + "px"; this.tlHead.appendChild(label);
      }
      this.planPaintAgenda(network);
      this.planPaintProposal();
    }
  });
