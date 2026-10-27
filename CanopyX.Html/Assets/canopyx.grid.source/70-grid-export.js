  // ---------- immutable export requests, independent of viewport pages ----------
  const gridExportSignal = (signal, options) => AbortSignal.any([signal, options?.signal].filter(Boolean));

  Object.assign(DataGrid.prototype, {
    // The installed runtime owns this pure projection; capture and controls ask the same owner.
    defaultExportColumns() { return this.visibleColumns().filter(column => column.exportable !== false); },
    prepareExport(options) {
      if (options?.pivot !== undefined && typeof options.pivot !== "boolean") throw new Error("CanopyX: pivot table capture requires a boolean option.");
      if (options?.pivot) throw new Error("CanopyX: pivot table capture requires the reporting export bridge.");
      if (!this.view.reporting && ["fileName", "locale", "timeZone", "onProgress"].some(key => options?.[key] !== undefined))
        throw new Error("CanopyX: export metadata requires reporting.");
      if (this.destroyed || !this.acceptedQuery) throw new Error("CanopyX: export needs an accepted query.");
      if (!options || !["filtered", "selected", "all"].includes(options.scope)) throw new Error("CanopyX: explicit export scope required.");
      const { scope, values, signal } = options, filtered = scope === "filtered";
      const selection = scope === "selected" ? [...this.selected] : [];
      const columnIds = options.columns === undefined ? this.defaultExportColumns().map(column => column.id) : options.columns;
      if (options.columns === undefined && !columnIds.length) throw new Error(this.labels.gridNoExportColumns);
      const columns = Array.isArray(columnIds) ? columnIds.map(id => this.columns.find(column => column.id === id)) : [];
      if (!Array.isArray(columnIds) || !columnIds.length || new Set(columnIds).size !== columnIds.length ||
          columns.some(column => !column || column.exportable === false)) throw new Error("CanopyX: invalid or unsupported export columns.");
      if (values !== undefined && !["raw", "display"].includes(values)) throw new Error("CanopyX: export values must be raw/display.");
      if (signal !== undefined && !(signal instanceof AbortSignal)) throw new Error("CanopyX: export requires AbortSignal.");
      const query = gridQuery(this.view, { ...this.acceptedQuery, offset: 0, cursor: undefined, limit: this.pageSize,
        search: filtered ? this.acceptedQuery.search : "",
        filterGroup: filtered ? this.acceptedQuery.filterGroup : undefined,
        tupleFilters: filtered ? this.acceptedQuery.tupleFilters : undefined,
        filters: filtered ? this.acceptedQuery.filters : [] });
      const { revision, total, matched } = this.snapshot;
      const request = gridFreeze({ scope, query, revision, total, matched, recordCount: scope === "selected" ? selection.length :
          filtered ? matched : total, selection,
        columns: columns.map(({ id, title, kind, format, valueLabels }) => ({ id, title, kind, ...(valueLabels ? { valueLabels: { ...valueLabels } } : {}), ...(format ? { format: { ...format } } : {}) })), presentation: GRID_REPORTING.exportRecord ? "semantic" : "text",
        values: values || "display", timeZone: this.local ? "local" : "utc", ...GRID_REPORTING.exportRequest?.(this, options) });
      // The descriptor is captured now, before the iterator is consumed or the UI query changes.
      return Object.freeze({ request, rows: options => this.exportRows(request, gridExportSignal(signal, options)) });
    }
  });
