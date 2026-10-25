  // Visual marks and edge routing; timeline/network coordinates are supplied by plumbing.
  const PLAN_METRICS = Object.freeze({ actualMinHeight: 4, actualBaselineGap: 5, baselineMinWidth: 3, baselineBottom: 2 });
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
        const turn = x2 * sign >= (x1 + 16 * sign) * sign ? (x1 + x2) / 2 : x1 + 12 * sign;
        const path = document.createElementNS(svg.namespaceURI, "path");
        const lead = x2 - 5 * sign;
        path.setAttribute("d", "M" + x1 + "," + from.y + " H" + turn + " V" + to.y + " H" + x2 + " M" + lead + "," + (to.y - 4) + " L" + x2 + "," + to.y + " L" + lead + "," + (to.y + 4));
        path.classList.toggle("cx-plan-link-conflict", edge.conflict);
        path.classList.toggle("cx-plan-link-critical", critical);
        const title = document.createElementNS(svg.namespaceURI, "title");
        title.textContent = text; path.appendChild(title); svg.appendChild(path);
  }
