  // ---------- calendar: recurrence replacement metadata ----------
  // User criteria choose displayed records. A selected series also needs to know which of its occurrences were replaced,
  // even when the replacement moved outside that query, resource or time window. These scoped support rows never become
  // displayed records or export input; only their series identity and original start are retained.
  const CAL_FIRST_INSTANT = Date.parse("0001-01-01T00:00:00Z");

  function calSeriesMasters(view, rows, from, to) {
    if (!view.cal.series || !view.cal.recurrenceId) return [];
    const out = [];
    for (const row of rows) {
      const base = calBase(view, row);
      if (!base?.rule) continue;
      const duration = Math.max(0, base.end - base.start);
      out.push({ id: base.key, from: Math.max(CAL_FIRST_INSTANT, base.start, from - duration), to });
    }
    return out;
  }

  function calOverrideMetadata(view, masters, rows) {
    const wanted = new Map(masters.map(master => [master.id, master])), overrides = new Map();
    for (const row of rows) {
      const base = calBase(view, row), master = base?.series && wanted.get(base.series);
      if (!master || !Number.isFinite(base.recurrenceId) || base.recurrenceId < master.from || base.recurrenceId >= master.to) continue;
      if (!overrides.has(base.series)) overrides.set(base.series, new Set());
      overrides.get(base.series).add(base.recurrenceId);
    }
    return overrides;
  }

  Object.assign(DataGrid.prototype, {
    /** Inline support comes from the same owning dataset before the reader's display criteria are applied. */
    calInlineOverrides(rows, from, to) {
      const masters = calSeriesMasters(this, rows, from, to);
      return masters.length ? calOverrideMetadata(this, masters, this.calEdited(this.view.rows)) : new Map();
    },
    /** Certifies each selected master's replacement metadata within a separate, bounded ordinary-query budget. */
    async calHostedOverrides(answer, from, to, signal) {
      const rows = this.calEdited(answer.rows, true), masters = calSeriesMasters(this, rows, from, to);
      if (!masters.length) return { ...answer, rows, overrides: new Map() };
      if (typeof answer.revision !== "string" || !answer.revision) throw new Error("CanopyX: calendar replacement metadata needs the range revision.");
      const budget = { pages: CAL_FALLBACK_PAGES, rows: this.cal.limit }, overrides = new Map(), withheld = new Set();
      for (let at = 0; at < masters.length; at += 1000) {
        const batch = masters.slice(at, at + 1000);
        if (!budget.pages || !budget.rows) { for (const master of batch) withheld.add(master.id); continue; }
        const lower = Math.min(...batch.map(master => master.from));
        // A neutral user query preserves source-owned authorization, while a moved replacement can differ from every
        // user criterion. Flat predicates keep an existing user's nested filter depth out of this metadata-only read.
        const query = { search: "", revision: answer.revision, sort: [], filters: [
          { column: this.cal.series.id, operator: "in", values: batch.map(master => master.id) },
          { column: this.cal.recurrenceId.id, operator: "ge", values: [calIso(lower)] },
          { column: this.cal.recurrenceId.id, operator: "lt", values: [calIso(to)] }
        ] };
        const support = await this.calQueryPages(query, signal, budget);
        // An incomplete batch cannot certify any of its masters. Keep ordinary events and earlier certified batches,
        // and disclose truncation instead of reviving an original occurrence whose replacement may be on a later page.
        if (support.truncated) { for (const master of batch) withheld.add(master.id); continue; }
        for (const [id, starts] of calOverrideMetadata(this, batch, this.calEdited(support.rows, true))) overrides.set(id, starts);
      }
      return { ...answer, rows: withheld.size ? rows.filter(row => !withheld.has(row.id)) : rows,
        overrides, truncated: answer.truncated || withheld.size > 0 };
    }
  });
