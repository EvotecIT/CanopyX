  DataGrid.prototype.validatePlanDefinition = function (decoded) {
    const input = this.view.plan, calendar = this.view.calendar, columns = new Map(this.columns.map(column => [column.id, column]));
    const kind = (id, type) => typeof id === "string" && columns.get(id)?.kind === type;
    if (!input || typeof input !== "object" || Array.isArray(input) || !calendar?.resources || !calendar.end || !calendar.resource ||
        calendar.recurrence || calendar.sources?.length || calendar.create || calendar.drop || calendar.views?.length && !calendar.views.includes("timeline") ||
        ["criticalPath", "proposeMoves", "avoidOverlap"].some(key => input[key] !== undefined && typeof input[key] !== "boolean") ||
        (input.baselineStart === undefined) !== (input.baselineEnd === undefined) || input.baselineStart !== undefined &&
          (!kind(input.baselineStart, "datetime") || !kind(input.baselineEnd, "datetime")) || input.milestone !== undefined && !kind(input.milestone, "text"))
      throw new Error("CanopyX: a plan needs a resource timeline, paired baseline date columns and valid options.");
    // This instance never grants the calendar's move/resize permission, including lazy editing installs and other views.
    // Host-driven grid edits remain available; task gestures use the plan's informational proposal path.
    this.calCanEdit = () => false;
    const seen = new Set(), next = new Map(), degree = new Map();
    if (input.dependencies !== undefined && (!Array.isArray(input.dependencies) || input.dependencies.length > 100000 || input.dependencies.some(edge => {
      if (!edge || typeof edge.predecessor !== "string" || !edge.predecessor || typeof edge.successor !== "string" || !edge.successor || edge.predecessor === edge.successor ||
          edge.lagMinutes !== undefined && (typeof edge.lagMinutes !== "number" || !Number.isFinite(edge.lagMinutes) || edge.lagMinutes < 0)) return true;
      const key = JSON.stringify([edge.predecessor, edge.successor]); if (seen.has(key)) return true; seen.add(key);
      if (!degree.has(edge.predecessor)) degree.set(edge.predecessor, 0);
      degree.set(edge.successor, (degree.get(edge.successor) || 0) + 1);
      if (!next.has(edge.predecessor)) next.set(edge.predecessor, []);
      next.get(edge.predecessor).push(edge.successor); return false;
    }))) throw new Error("CanopyX: a plan needs unique finish-to-start dependencies with nonnegative lag.");
    const queue = [...degree.keys()].filter(id => degree.get(id) === 0); let visited = 0;
    for (let at = 0; at < queue.length; at++) {
      const id = queue[at]; visited++;
      for (const target of next.get(id) || []) { const left = degree.get(target) - 1; degree.set(target, left); if (!left) queue.push(target); }
    }
    if (visited !== degree.size) throw new Error("CanopyX: plan dependencies cannot contain a cycle.");
    if (this.view.source.kind === "inline" && !this.opts.source && (!this.view.rowData || decoded)) {
      const rows = new Set(this.view.rows.map(row => row.id));
      for (const id of degree.keys()) if (!rows.has(id)) throw new Error("CanopyX: a plan dependency names an unknown task: " + id);
    }
  };
