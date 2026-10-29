  const PLAN_LABELS = {
    planMilestone: "Milestone", planCritical: "Critical path", planBaseline: "Baseline: {start} – {end}",
    planDependency: "{from} finishes before {to} starts", planDependencyConflict: "Dependency conflict with {task}",
    planOverlapConflict: "Overlaps {task}", planIncomplete: "The complete task network is unavailable; the host must check this proposal.",
    planInvalidRange: "The task must finish at or after its start.", planInvalidResource: "Choose a task resource.",
    planProposal: "Proposed {task}: {start} – {end}", planMoveHint: "Alt+Left or Alt+Right proposes a new date; Alt+Up or Alt+Down proposes a resource.",
    planConflict: "Conflict", planActual: "Actual", planPending: "Proposal awaiting the host", planBaselineLabel: "Baseline", planDependencies: "Dependencies"
  };
  const PLAN_EVENT = DataGrid.prototype.calEventElement;
  DataGrid.prototype.calEventElement = function (event, kind, day) {
    const element = PLAN_EVENT.call(this, event, kind, day);
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
        this.lifetime.signal.addEventListener("abort", () => {
          legend.remove();this.host.classList.remove("cx-plan-host");
          if(this.planFit&&this.host.style.maxHeight===this.planFit.written)this.host.style.maxHeight=this.planFit.inline;
          this.planAgendaModel=this.planAgendaState=null;
        }, { once: true });
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
            element.style.height = Math.max(PLAN_METRICS.actualMinHeight, element._planHeight - PLAN_METRICS.actualBaselineGap) + "px";
          }
          const rect = element.getBoundingClientRect(), start = axis.x(task.tlStart), end = axis.x(planMilestone(this, task) ? task.tlStart : task.tlEnd);
          if (!positions.has(task.key)) positions.set(task.key, { start, end, y: rect.top - canvasBox.top + rect.height / 2, top: rect.top - canvasBox.top, bottom: rect.bottom - canvasBox.top, element });
          const title = element.querySelector(".cx-cal-ev-title");
          if (title) {
            title.style.maxInlineSize = "";
            title.title = task.title; element.classList.remove("cx-plan-label-before");
            const outside=title.scrollWidth>element.clientWidth-12||planMilestone(this,task);element.classList.toggle("cx-plan-label-outside",outside);
            const box=title.getBoundingClientRect(),x=axis.x(Date.now()),today=canvasBox.left+(this.calRtl?axis.total-x:x);
            element.classList.toggle("cx-plan-label-before",outside&&this.cal.now&&today>=box.left-4&&today<=box.right+4);
          }
          if (!spec.baselineStart || !spec.baselineEnd) continue;
          const from = planInstant(task.row.cells[spec.baselineStart]), to = planInstant(task.row.cells[spec.baselineEnd]);
          if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || from >= axis.to || to < axis.from) continue;
          const text = this.planText("planBaseline", { start: this.calFmt.longDay(this.calZone.day(from)), end: this.calFmt.longDay(this.calZone.day(to)) });
          planBaselineTemplate(element, lane, axis, from, to, text);
          // Baselines are also spoken on the actual task button rather than adding a non-cell to the ARIA grid.
          element._planName ||= element.getAttribute("aria-label"); element.setAttribute("aria-label", element._planName + "; " + text);
        }
      }
      // Outside labels share the painted lane with other tasks. Keep a colliding short-bar label inside its own bar;
      // the existing title/accessible name retains the complete text. Milestone labels remain obstacles, not casualties.
      for (const lane of this.tlLanes.values()) {
        const rows = new Map();
        for (const element of lane.querySelectorAll(".cx-plan-task")) {
          const key = element.style.top;
          if (!rows.has(key)) rows.set(key, []);
          rows.get(key).push({ element, title: element.querySelector(".cx-cal-ev-title"), box: element.getBoundingClientRect() });
        }
        const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        for (const items of rows.values()) {
          items.sort((a, b) => a.box.left - b.box.left);
          for (const [index, item] of items.entries()) {
            if (!item.title || !item.element.classList.contains("cx-plan-label-outside") || item.element.classList.contains("cx-plan-milestone")) continue;
            const box = item.title.getBoundingClientRect();
            if ([items[index - 1], items[index + 1]].some(other => other && (overlaps(box, other.box) || other.title && overlaps(box, other.title.getBoundingClientRect()))))
              item.element.classList.remove("cx-plan-label-outside", "cx-plan-label-before");
          }
        }
        // A milestone has no bar to hold a clipped title. Use the clearer side and cap its label at the next obstacle.
        const tasks = [...lane.querySelectorAll(".cx-plan-task")];
        for (const element of tasks.filter(task => task.classList.contains("cx-plan-milestone"))) {
          const title = element.querySelector(".cx-cal-ev-title"); if (!title) continue;
          const box = element.getBoundingClientRect(), label = title.getBoundingClientRect();
          const obstacles = tasks.filter(task => task !== element).flatMap(task => [task, task.querySelector(".cx-cal-ev-title")]).filter(Boolean)
            .map(task => task.getBoundingClientRect()).filter(other => other.top < label.bottom && other.bottom > label.top);
          const rtl = this.calRtl, currentBefore = element.classList.contains("cx-plan-label-before");
          const gap = Math.max(0, currentBefore !== rtl ? box.left - label.right : label.left - box.right);
          const after = Math.max(0, Math.min(canvasBox.right, ...obstacles.filter(other => other.right > box.right + gap).map(other => other.left)) - box.right - gap - 2);
          const before = Math.max(0, box.left - gap - Math.max(canvasBox.left, ...obstacles.filter(other => other.left < box.left - gap).map(other => other.right)) - 2);
          const currentRoom = currentBefore !== rtl ? before : after;
          const alternateRoom = currentBefore !== rtl ? after : before;
          const flip = currentRoom < label.width && alternateRoom > currentRoom;
          if (flip) element.classList.toggle("cx-plan-label-before");
          title.style.maxInlineSize = Math.min(parseFloat(getComputedStyle(title).maxInlineSize) || 160, flip ? alternateRoom : currentRoom) + "px";
        }
      }
      // The links use final label bounds: a short stacked milestone may have text across its centerline.
      for (const position of positions.values()) {
        const title = position.element.querySelector(".cx-cal-ev-title"), rect = title?.getBoundingClientRect();
        if (rect?.width) position.label = { left: rect.left - canvasBox.left, right: rect.right - canvasBox.left, top: rect.top - canvasBox.top, bottom: rect.bottom - canvasBox.top };
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
      if(!this.calPhone) {
        const padding = parseFloat(getComputedStyle(this.tlCanvas).paddingBottom) || 0;
        const scrollbar = this.tlMain.offsetHeight - this.tlMain.clientHeight;
        this.planFitHeight((this.tlTree.tops[this.tlTree.rows.length]||0)+this.tlHead.offsetHeight+padding+scrollbar+2);
      }
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
