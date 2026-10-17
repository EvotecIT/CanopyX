  // ---------- calendar: bounded ordinary source traversal ----------
  // Range fallback and recurrence support reads share the source's own paging, cancellation and snapshot contract. The
  // caller supplies a remaining budget, so batching support queries cannot multiply the calendar's page or record limit.
  Object.assign(DataGrid.prototype, {
    async calQueryPages(query, signal, budget) {
      const rows = [], ids = new Set(), tokens = new Set(), cursor = this.cursor;
      let next, revision = query.revision, snapshot = null, matched = 0, complete = false;
      while (budget.pages > 0 && budget.rows > 0) {
        let input = gridQuery(this.view, { ...query, limit: Math.min(10000, this.pageSize, budget.rows), revision,
          offset: cursor ? undefined : rows.length, cursor: cursor ? next : undefined });
        // Dynamic grouping is a presentation of the accepted grid. Calendar readers request ordinary records, keeping
        // their own requested sort; only a canonical query that already carries levels gets the empty groupBy field.
        if (input.groupBy?.length) input = gridQuery(this.view, { ...input, groupBy: [], sort: query.sort || [] });
        const raw = await this.runGridHook(hook => this.source.query(input, { signal: hook }), signal);
        const page = cursor ? validateGridCursorPage(raw, this.view, input, snapshot) : validateGridPage(raw, this.view, input, snapshot);
        if (page.offset !== rows.length) throw new Error("CanopyX: calendar pages do not form one result.");
        for (const row of page.items) {
          if (ids.has(row.id)) throw new Error("CanopyX: calendar pages repeat a record.");
          ids.add(row.id); rows.push(row);
        }
        budget.pages--; budget.rows -= page.items.length;
        revision = page.revision; matched = page.matched;
        snapshot ||= { revision, total: page.total, matched: page.matched };
        complete = cursor ? page.nextCursor === undefined : rows.length === matched;
        if (complete) break;
        if (cursor) {
          next = page.nextCursor;
          if (tokens.has(next)) throw new Error("CanopyX: calendar pages repeat a cursor.");
          tokens.add(next);
        }
      }
      return { rows, matched, revision, truncated: !complete };
    }
  });
