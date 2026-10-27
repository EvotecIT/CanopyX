  // Visual marks and edge routing; timeline/network coordinates are supplied by plumbing.
  const PLAN_METRICS = Object.freeze({ actualMinHeight: 4, actualBaselineGap: 16, baselineMinWidth: 3, baselineBottom: 7 });
  function planTaskTemplate(element, event, node, labels, milestone, critical, proposeMoves) {
      element.classList.add("cx-plan-task");
      element.classList.toggle("cx-plan-milestone", milestone); element.classList.toggle("cx-plan-critical", !!critical);
      element.classList.toggle("cx-plan-conflict", !!node && [...node.before, ...node.after].some(edge => edge.conflict));
      if (milestone) labels.push(this.planText("planMilestone"));
      if (critical) labels.push(this.planText("planCritical"));
      for (const edge of node?.before || []) if (edge.conflict) labels.push(this.planText("planDependencyConflict", { task: edge.from.task.title }));
      if (proposeMoves) { element.setAttribute("aria-keyshortcuts", "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"); labels.push(this.planText("planMoveHint")); }
      element.setAttribute("aria-label", labels.join(", "));
      element.title = labels.join(", ");
  }
  function planLegendTemplate() {
        const legend = h("div", "cx-plan-legend");
        for (const [kind, label] of [["critical", "planCritical"], ["baseline", "planBaselineLabel"], ["dependency", "planDependencies"]]) {
          const item = h("span"), mark = h("i", "cx-plan-key-" + kind); mark.setAttribute("aria-hidden", "true");
          item.append(mark, document.createTextNode(this.planText(label))); legend.appendChild(item);
        }
        const conflict = h("span"), mark = h("i", "cx-plan-key-conflict"); mark.setAttribute("aria-hidden", "true");
        conflict.append(mark, document.createTextNode(this.planText("planConflict"))); legend.appendChild(conflict);
        return legend;
  }
  function planBaselineTemplate(element, lane, axis, from, to, text) {
          const line = h("div", "cx-plan-baseline");
          line.style.insetInlineStart = axis.x(from) + "px"; line.style.width = Math.max(PLAN_METRICS.baselineMinWidth, axis.x(to) - axis.x(from)) + "px";
          line.style.top = (Number.parseFloat(element.style.top) + element._planHeight - PLAN_METRICS.baselineBottom) + "px";
          line.title = text; line.setAttribute("aria-hidden", "true"); lane.appendChild(line);
  }
  function planLinksTemplate(axis, height) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("cx-plan-links"); svg.setAttribute("aria-hidden", "true"); svg.style.width = axis.total + "px";
      svg.style.height = height;
      return svg;
  }
  function planLinkTemplate(svg, axis, from, to, edge, critical, text) {
        const mirror = x => this.calRtl ? axis.total - x : x, x1 = mirror(from.end), x2 = mirror(to.start), sign = this.calRtl ? -1 : 1;
        const exit = x1 + 10 * sign, entry = x2 - 10 * sign;
        const corridor = from.bottom + (to.y >= from.y ? 1 : -1) * 4;
        const path = document.createElementNS(svg.namespaceURI, "path");
        const lead = x2 - 5 * sign;
        path.setAttribute("d", "M" + x1 + "," + from.y + " H" + exit + " V" + corridor + " H" + entry + " V" + to.y + " H" + x2 + " M" + lead + "," + (to.y - 4) + " L" + x2 + "," + to.y + " L" + lead + "," + (to.y + 4));
        path.classList.toggle("cx-plan-link-conflict", edge.conflict);
        path.classList.toggle("cx-plan-link-critical", critical);
        const title = document.createElementNS(svg.namespaceURI, "title");
        title.textContent = text; path.appendChild(title); svg.appendChild(path);
  }
  function planAgendaTemplate(groups, labels) {
    const root = h("div", "cx-plan-agenda");
    for (const group of groups) {
      const section = h("section"), title = h("h3"), list = h("ul"); setText(title, group.label); section.append(title, list);
      for (const item of group.items) {
        const row = h("li"), button = h("button", "cx-btn cx-plan-agenda-title"), dates = h("p"), meta = h("p", "cx-plan-agenda-meta");
        button.type = "button"; setText(button, item.task.title); button.dataset.cxPlanRecord = item.task.key; button.dataset.cxPlanResource = group.id;
        setText(dates, item.dates); setText(meta, item.meta); row.classList.toggle("cx-plan-agenda-critical", item.critical);
        row.append(button, dates, meta); list.appendChild(row);
      }
      if (!group.items.length) { const empty = h("p"); setText(empty, labels.calendarNoEvents); section.appendChild(empty); }
      root.appendChild(section);
    }
    return root;
  }
