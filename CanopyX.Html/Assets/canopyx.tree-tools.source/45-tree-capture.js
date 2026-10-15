  // ---------- tree tools: export captures ----------
  // Captures happen synchronously, so a capture reflects the tree at invocation; the writers (87-export-formats.js) read
  // its rows later. Every tree gets prepareExport and exportAs from this part; the tree API forwards to them once ready.
  const TREE_EXPORT = {
    /**
     * Captures the visible rows, the loaded selected nodes in tree order, or every node (the whole tree of an inline
     * source, the loaded nodes of a lazy one, in the current sort order), with their level and id path.
     */
    prepareExport(options = {}) {
      const { scope = "visible", values = "display", signal } = options;
      if (this.destroyed || !["visible", "selected", "all"].includes(scope) || !["raw", "display"].includes(values) || signal !== undefined && !(signal instanceof AbortSignal))
        throw new Error("CanopyX: invalid tree export.");
      // The shown columns, including those hidden only for width.
      const ids = options.columns ?? this.columns.filter(column => !column.hidden).map(column => column.id);
      const columns = Array.isArray(ids) ? ids.map(id => this.columns.find(column => column.id === id)) : [];
      if (!columns.length || columns.some(column => !column) || new Set(ids).size !== ids.length) throw new Error("CanopyX: invalid export columns.");
      const rows = [], add = (node, level, path) => { if (!node.detail) rows.push({ id: node.id, level, path, node: { ...node } }); };
      const sort = this.sortState, column = sort && this.columns.find(item => item.id === sort.column), index = this.columns.indexOf(column);
      const key = node => sortKey(this.cellOf(node, column, index), column);
      // Inline nodes that never loaded have no wrappers: their declared children are read in the order the tree sorts them.
      const raw = (nodes, level, path) => (column && !this.queryAware ? nodes.map((node, at) => [key(node), at, node])
        .sort((a, b) => compareKeys(a[0], b[0], sort.direction === "desc" ? -1 : 1) || a[1] - b[1]).map(entry => entry[2]) : nodes)
        .forEach(node => { const at = [...path, node.id]; add(node, level, at); if (node.children) raw(node.children, level + 1, at); });
      const walk = parent => this.modelChildren(parent).forEach(w => { if (scope === "all" || this.selected.has(w)) add(w.h, w.level, this.pathOf(w)); walk(w); });
      if (scope === "visible") this.rows.forEach(w => { if (!w.status) add(w.h, w.level, this.pathOf(w)); });
      else if (scope === "all" && this.root.inlineItems) raw(this.root.inlineItems, 1, []);
      else walk(this.root);
      const request = Object.freeze({ kind: "tree", scope, presentation: "text", values, revision: this.datasetRevision, recordCount: rows.length,
        columns: Object.freeze(columns.map(({ id, title, kind }) => Object.freeze({ id, title, kind }))), locale: this.lang, timeZone: this.local ? "local" : "utc" }), grid = this;
      return Object.freeze({ request, rows: async function* (more) {
        const linked = AbortSignal.any([grid.lifetime.signal, signal, more?.signal].filter(Boolean));
        await exportPartReady(); yield* EXPORT_IMPL.treeRows(grid, request, rows, linked);
      } });
    },

    exportAs(format, options) { return exportAs(this, format, options); }
  };
