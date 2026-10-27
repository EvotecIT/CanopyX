  // Plan analysis uses elapsed durations, never a product's working-time or scheduling rules.
  function planInstant(value) {
    value = cellValue(value);
    return typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
  }
  function planMilestone(grid, task) {
    const value = grid.view.plan.milestone && cellValue(task.row.cells[grid.view.plan.milestone]);
    return task.end === task.start || value === true || value === "true";
  }
  function planNetwork(tasks, dependencies) {
    const nodes = new Map(), edges = [], missing = new Set();
    for (const task of tasks) if (!task.background) nodes.set(task.key, { task, before: [], after: [], degree: 0, early: 0, late: Infinity });
    for (const input of dependencies) {
      const from = nodes.get(input.predecessor), to = nodes.get(input.successor), lag = (input.lagMinutes || 0) * 60000;
      if (!from || !to) { if (!from) missing.add(input.predecessor); if (!to) missing.add(input.successor); continue; }
      const edge = { from, to, lag, conflict: from.task.end + lag > to.task.start };
      from.after.push(edge); to.before.push(edge); to.degree++; edges.push(edge);
    }
    const queue = [...nodes.values()].filter(node => !node.degree), order = [];
    let finish = 0;
    for (let at = 0; at < queue.length; at++) {
      const node = queue[at], duration = node.task.end - node.task.start;
      order.push(node); finish = Math.max(finish, node.early + duration);
      for (const edge of node.after) {
        edge.to.early = Math.max(edge.to.early, node.early + duration + edge.lag);
        if (!--edge.to.degree) queue.push(edge.to);
      }
    }
    const complete = missing.size === 0 && order.length === nodes.size;
    if (complete) for (let at = order.length - 1; at >= 0; at--) {
      const node = order[at], duration = node.task.end - node.task.start;
      node.late = node.after.length ? node.after.reduce((least, edge) => Math.min(least, edge.to.late - edge.lag), Infinity) - duration : finish - duration;
      node.critical = Math.abs(node.late - node.early) < 1;
    }
    return { nodes, edges, complete, missing: [...missing], cycle: order.length !== nodes.size };
  }
  Object.assign(DataGrid.prototype, {
    planAnalyze() {
      if (!this.view.plan) return null;
      const cache = this.planAnalysis;
      if (cache?.version === this.calVersion && cache.events === this.calEvents && cache.rows === this.view.rows) return cache.network;
      // Inline analysis includes tasks outside the current date window and filters, so navigating does not change criticality.
      const inline = this.view.source.kind === "inline" && !this.opts.source;
      const tasks = (inline ? this.calEdited(this.view.rows).map(row => this.calKit.calBase(this, row)).filter(Boolean) : this.calEvents)
        .map(task => planMilestone(this, task) ? { ...task, end: task.start } : task);
      const network = planNetwork(tasks, this.view.plan.dependencies || []);
      // A hosted range cannot prove that every task was loaded, including isolated tasks with no edges.
      if (!inline || tasks.length !== this.view.rows.length && inline) network.complete = false;
      this.planAnalysis = { version: this.calVersion, events: this.calEvents, rows: this.view.rows, network };
      return network;
    },
    planText(name, values) {
      const text = this.labels[name] || this.calLabels?.[name] || PLAN_LABELS[name];
      return values ? fill(text, values) : text;
    },
    planProblems(task, proposal) {
      const network = this.planAnalyze(), problems = [];
      const add = (kind, other, label) => problems.push({ kind, id: other?.key ?? null, label });
      if (!Number.isFinite(proposal.start) || !Number.isFinite(proposal.end) || proposal.end < proposal.start)
        add("range", null, this.planText("planInvalidRange"));
      if (!this.calAllowsSpan(proposal.start, proposal.end, task.allDay)) add("range", null, this.calLabels.calendarOutsideRange);
      if (proposal.resource != null && (!this.tl.names.has(proposal.resource) || this.tl.children.has(proposal.resource)))
        add("resource", null, this.planText("planInvalidResource"));
      const node = network.nodes.get(task.key);
      if (!network.complete) add("incomplete", null, this.planText("planIncomplete"));
      for (const edge of node?.before || []) if (proposal.start < edge.from.task.end + edge.lag)
        add("dependency", edge.from.task, this.planText("planDependencyConflict", { task: edge.from.task.title }));
      for (const edge of node?.after || []) if (proposal.end + edge.lag > edge.to.task.start)
        add("dependency", edge.to.task, this.planText("planDependencyConflict", { task: edge.to.task.title }));
      const overlap = (start, end) => this.calKit.calOverlaps(start, end, proposal.start, proposal.end) ||
        this.calKit.calOverlaps(proposal.start, proposal.end, start, end);
      if (this.view.plan.avoidOverlap !== false) for (const other of network.nodes.values()) {
        const item = other.task;
        if (item.key !== task.key && item.resource === proposal.resource && overlap(item.start, item.end))
          add("overlap", item, this.planText("planOverlapConflict", { task: item.title }));
      }
      for (const range of this.calRanges) if (range.kind === "unavailable" && (range.resource == null || range.resource === proposal.resource) && overlap(range.start, range.end))
        add("unavailable", null, this.calLabels.calendarUnavailable);
      return problems;
    }
  });
