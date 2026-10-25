  const PLAN_LABELS = {
    planMilestone: "Milestone", planCritical: "Critical path", planBaseline: "Baseline: {start} – {end}",
    planDependency: "{from} finishes before {to} starts", planDependencyConflict: "Dependency conflict with {task}",
    planOverlapConflict: "Overlaps {task}", planIncomplete: "The complete task network is unavailable; the host must check this proposal.",
    planInvalidRange: "The task must finish at or after its start.", planInvalidResource: "Choose a task resource.",
    planProposal: "Proposed {task}: {start} – {end}", planMoveHint: "Alt+Left or Alt+Right proposes a new date; Alt+Up or Alt+Down proposes a resource.",
    planActual: "Actual", planPending: "Proposal awaiting the host", planBaselineLabel: "Baseline", planDependencies: "Dependencies"
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
      element.classList.add("cx-plan-task");
      const milestone = planMilestone(this, event), critical = this.view.plan.criticalPath !== false && network.complete && node?.critical;
      element.classList.toggle("cx-plan-milestone", milestone); element.classList.toggle("cx-plan-critical", !!critical);
      element.classList.toggle("cx-plan-conflict", !!node && [...node.before, ...node.after].some(edge => edge.conflict));
      if (milestone) labels.push(this.planText("planMilestone"));
      if (critical) labels.push(this.planText("planCritical"));
      for (const edge of node?.before || []) if (edge.conflict) labels.push(this.planText("planDependencyConflict", { task: edge.from.task.title }));
      if (this.view.plan.proposeMoves) { element.setAttribute("aria-keyshortcuts", "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"); labels.push(this.planText("planMoveHint")); }
      element.setAttribute("aria-label", labels.join(", "));
      element.title = labels.join(", ");
    },
    planPaint() {
      this.tlRoot.classList.add("cx-plan");
      if (!this.planLegend) {
        const legend = this.planLegend = h("div", "cx-plan-legend");
        for (const [kind, label] of [["critical", "planCritical"], ["baseline", "planBaselineLabel"], ["dependency", "planDependencies"]]) {
          const item = h("span"), mark = h("i", "cx-plan-key-" + kind); mark.setAttribute("aria-hidden", "true");
          item.append(mark, document.createTextNode(this.planText(label))); legend.appendChild(item);
        }
        this.calBody.before(legend);
        this.lifetime.signal.addEventListener("abort", () => legend.remove(), { once: true });
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
            if (!planMilestone(this, task)) element.style.height = Math.max(4, element._planHeight - 5) + "px";
          }
          const rect = element.getBoundingClientRect(), start = axis.x(task.tlStart), end = axis.x(planMilestone(this, task) ? task.tlStart : task.tlEnd);
          if (!positions.has(task.key)) positions.set(task.key, { start, end, y: rect.top - canvasBox.top + rect.height / 2 });
          if (!spec.baselineStart || !spec.baselineEnd) continue;
          const from = planInstant(task.row.cells[spec.baselineStart]), to = planInstant(task.row.cells[spec.baselineEnd]);
          if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || from >= axis.to || to < axis.from) continue;
          const line = h("div", "cx-plan-baseline");
          line.style.insetInlineStart = axis.x(from) + "px"; line.style.width = Math.max(3, axis.x(to) - axis.x(from)) + "px";
          line.style.top = (Number.parseFloat(element.style.top) + element._planHeight - 2) + "px";
          const text = this.planText("planBaseline", { start: this.calFmt.longDay(this.calZone.day(from)), end: this.calFmt.longDay(this.calZone.day(to)) });
          line.title = text; line.setAttribute("aria-hidden", "true"); lane.appendChild(line);
          // Baselines are also spoken on the actual task button rather than adding a non-cell to the ARIA grid.
          element._planName ||= element.getAttribute("aria-label"); element.setAttribute("aria-label", element._planName + "; " + text);
        }
      }
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("cx-plan-links"); svg.setAttribute("aria-hidden", "true"); svg.style.width = axis.total + "px";
      svg.style.height = this.tlCanvas.style.height;
      for (const edge of network.edges) {
        const from = positions.get(edge.from.task.key), to = positions.get(edge.to.task.key);
        if (!from || !to) continue;
        const mirror = x => this.calRtl ? axis.total - x : x, x1 = mirror(from.end), x2 = mirror(to.start), sign = this.calRtl ? -1 : 1;
        const turn = x2 * sign >= (x1 + 16 * sign) * sign ? (x1 + x2) / 2 : x1 + 12 * sign;
        const path = document.createElementNS(svg.namespaceURI, "path");
        const lead = x2 - 5 * sign;
        path.setAttribute("d", "M" + x1 + "," + from.y + " H" + turn + " V" + to.y + " H" + x2 + " M" + lead + "," + (to.y - 4) + " L" + x2 + "," + to.y + " L" + lead + "," + (to.y + 4));
        path.classList.toggle("cx-plan-link-conflict", edge.conflict);
        const tight = Math.abs(edge.from.early + edge.from.task.end - edge.from.task.start + edge.lag - edge.to.early) < 1;
        path.classList.toggle("cx-plan-link-critical", this.view.plan.criticalPath !== false && network.complete && edge.from.critical && edge.to.critical && tight);
        const title = document.createElementNS(svg.namespaceURI, "title");
        title.textContent = this.planText("planDependency", { from: edge.from.task.title, to: edge.to.task.title }); path.appendChild(title); svg.appendChild(path);
      }
      this.planLinks?.remove(); this.planLinks = svg; this.tlCanvas.appendChild(svg);
      this.tlRoot.dataset.cxPlanComplete = String(network.complete);
      this.planPaintProposal();
    }
  });
