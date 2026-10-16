  // ---------- calendar: loading the records of the visible range ----------
  // Inline grids read their own rows: the accepted query (search, the reader's filters, facets and external filters) picks
  // the records, then the range picks their occurrences, with no request. A hosted grid asks its source for the range: a
  // source with range(request, { signal }) receives a gridRangeQuery (the accepted query, from and to in UTC, the columns
  // that hold starts, ends, recurrences and resources, the visible resources and the view) and answers a gridRangePage; any
  // other source receives ordinary gridQuery pages whose filter group asks for records overlapping the range. Answers are
  // cached per range and accepted query, so going back and forth reads nothing twice; a new revision or query starts afresh.
  const CAL_CACHE = 12, CAL_FALLBACK_PAGES = 10;

  Object.assign(DataGrid.prototype, {
    /** The records of the accepted query that can show in [from, to): every matching record for inline data. */
    async calRecords(from, to, signal) {
      const query = this.acceptedQuery || gridQuery(this.view, this.view.query || {});
      if (this.view.source.kind === "inline" && !this.opts.source) {
        // Compact row data: the calendar shows a range once every chunk is decoded; a first window starts the decoding.
        if (this.view.rowData) {
          if (!this.source.decoded) await this.source.query({ ...query, offset: 0, limit: 1 }, { signal });
          await this.source.decoded;
        }
        const rows = this.view.rows, key = gridResultShape(query);
        // New and removed rows change the array in place and give the grid a new source: either one reads the rows again.
        if (this.calRowsCache?.rows !== rows || this.calRowsCache.key !== key || this.calRowsCache.source !== this.source) {
          const plain = !query.search && !query.filters.length && !query.filterGroup;
          this.calRowsCache = { rows, key, source: this.source, matched: plain ? rows : gridQueryRows(this.view, query, new Map(this.view.columns.map(column => [column.id, column])), null) };
        }
        return { rows: this.calEdited(this.calRowsCache.matched), truncated: false };
      }
      // All-day records start at the midnight their date is written with, which lies outside a range of zone days west of UTC:
      // hosted requests ask for a day more on each side, and the occurrences are clipped to the range as inline ones are.
      if (this.cal.allDay) { from -= CAL_DAY; to += CAL_DAY; }
      // A hosted timeline names the resources in view, so its resource tree has its first rows before the first request.
      if (this.calResourcesReady) await this.calResourcesReady();
      const resources = this.calResourceWindow?.() || null, key = JSON.stringify([gridResultShape(query), query.revision, from, to, resources]);
      this.calWindowKey = JSON.stringify(resources);
      const cache = this.calCache ||= new Map();
      if (cache.has(key)) { const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return { ...hit, rows: this.calEdited(hit.rows, true) }; }
      let answer;
      if (typeof this.source.range === "function" && !this.calNoRange) {
        // A server that cannot answer ranges (code "unsupported") is asked through ordinary queries from then on.
        try { answer = await this.calRangeRequest(query, from, to, resources, signal); }
        catch (error) { if (error?.code !== "unsupported") throw error; this.calNoRange = true; }
      }
      answer ||= await this.calFallbackRequest(query, from, to, signal);
      cache.set(key, answer);
      while (cache.size > CAL_CACHE) cache.delete(cache.keys().next().value);
      return { ...answer, rows: this.calEdited(answer.rows, true) };
    },
    /**
     * Records with their unsaved edits: the editing part keeps changed copies, which the calendar shows in their place. A hosted
     * calendar adds the new records the writer has not stored yet (inline ones are in the rows already).
     */
    calEdited(rows, hosted) {
      const changes = this.edit?.changes;
      if (!changes?.size) return rows;
      const out = rows.map(row => changes.get(row.id)?.row || row);
      if (hosted && this.edit.inserted?.size) { const ids = new Set(rows.map(row => row.id)); for (const [id, row] of this.edit.inserted) if (!ids.has(id)) out.push(changes.get(id)?.row ?? row); }
      return out;
    },

    calRangeRequest(query, from, to, resources, signal) {
      const cal = this.cal, request = { protocol: PROTOCOL, type: "gridRangeQuery", view: this.view.id,
        query: { ...query, offset: 0, limit: Math.min(10000, cal.limit) }, from: calIso(from), to: calIso(to), start: cal.start.id, calendarView: this.calView, limit: Math.min(10000, cal.limit) };
      for (const name of ["end", "recurrence", "seriesEnd", "resource"]) if (cal[name]) request[name] = cal[name].id;
      if (resources && cal.resource) request.resources = resources;
      return this.runGridHook(hook => this.source.range(gridFreeze(request), { signal: hook }), signal).then(page => {
        checkDocument(page, "gridRangePage");
        if (page.view !== this.view.id || !Array.isArray(page.items) || !validStructuralCount(page.matched) || page.items.length > request.limit || page.items.length > page.matched ||
            typeof page.truncated !== "boolean" || page.truncated !== page.items.length < page.matched)
          throw new Error("CanopyX: the range page does not answer its query.");
        if (query.revision !== undefined && page.revision !== query.revision) throw new Error("CanopyX: grid page snapshot changed.");
        validateGridRows(page.items, this.view.columns);
        return { rows: page.items, truncated: page.truncated, matched: page.matched };
      });
    },

    /** Sources without range read ordinary pages of the records overlapping the range (at most ten pages). */
    async calFallbackRequest(query, from, to, signal) {
      const cal = this.cal, iso = value => calIso(value), groups = [];
      const plain = { operator: "or", filters: [{ column: cal.start.id, operator: "ge", values: [iso(from)] }], groups: [] };
      if (cal.end) plain.filters.push({ column: cal.end.id, operator: "gt", values: [iso(from)] });
      if (cal.recurrence) {
        const series = { operator: "and", filters: [{ column: cal.recurrence.id, operator: "isNotNull", values: [] }], groups: [] };
        if (cal.seriesEnd) series.groups.push({ operator: "or", filters: [{ column: cal.seriesEnd.id, operator: "isNull", values: [] }, { column: cal.seriesEnd.id, operator: "gt", values: [iso(from)] }], groups: [] });
        plain.groups.push(series);
      }
      groups.push(plain);
      if (query.filterGroup) groups.push(query.filterGroup);
      const limit = Math.min(10000, this.pageSize), rows = [];
      // Pages are ordered by start (then identity), so offset paging over a database never repeats or skips a record.
      let input = gridQuery(this.view, { ...query, offset: 0, limit, sort: cal.start.sortable ? [{ column: cal.start.id, direction: "asc" }] : [],
        filterGroup: { operator: "and", filters: [{ column: cal.start.id, operator: "lt", values: [iso(to)] }], groups } }), matched = 0;
      for (let page = 0; page < CAL_FALLBACK_PAGES; page++) {
        const answer = validateGridPage(await this.runGridHook(hook => this.source.query(input, { signal: hook }), signal), this.view, input, null);
        rows.push(...answer.items); matched = answer.matched;
        if (rows.length >= answer.matched || rows.length >= cal.limit) break;
        input = gridQuery(this.view, { ...input, offset: rows.length, revision: answer.revision });
      }
      return { rows, truncated: rows.length < matched, matched };
    },

    /** Loads the occurrences of the current range and paints the view; a newer load or query wins. */
    async calReload(options = {}) {
      if (this.destroyed || !this.calBody) return;
      const epoch = ++this.calEpoch, range = this.calRange = this.calRangeOf(this.calView, this.calDate);
      this.calSyncBar(!!options.announce);
      const from = this.calZone.start(range.firstDay), to = this.calZone.start(range.lastDay + 1);
      const lifetime = this.calLifetime = new AbortController(), signal = AbortSignal.any ? AbortSignal.any([lifetime.signal, this.dataLifetime.signal]) : lifetime.signal;
      this.calPrevLifetime?.abort(); this.calPrevLifetime = lifetime;
      let answer;
      const slow = setTimeout(() => { if (epoch === this.calEpoch) this.calNotice(this.calLabels.calendarLoading, false); }, 200);
      // iCalendar sources load once (the iCalendar part fetches and reads them); their events join every range read-only.
      if (this.cal.sources.some(source => source.ics) && !this.calIcsLoad) this.calIcsLoad = this.calLoadPart("calendar-ics").then(() => this.calLoadIcs()).catch(error => { this.calIcsLoad = null; throw error; });
      try { answer = await this.calRecords(from, to, signal); if (this.calIcsLoad) await this.calIcsLoad; }
      catch (error) {
        clearTimeout(slow);
        if (epoch !== this.calEpoch || error.name === "AbortError" || this.destroyed) return;
        this.calNotice(fill(this.calLabels.calendarLoadError, { error: error.message }), true); this.emit("error", { error });
        return;
      }
      clearTimeout(slow);
      if (epoch !== this.calEpoch || this.destroyed) return;
      const events = calOccurrences(this, this.calIcsRows?.length ? [...answer.rows, ...this.calIcsRows] : answer.rows, from, to);
      this.calAllEvents = events; this.calEvents = this.calShownEvents(events); this.calRanges = calStaticRanges(this, from, to);
      // A refused or failed edit stays said while the same period reloads around it (a commit, live data); another period
      // or view drops it. A truncated period says so as well.
      const sticky = this.calSticky?.at === this.calStickyKey() ? this.calSticky.text : "";
      const truncated = answer.truncated || events.truncated ? fill(this.calLabels.calendarTruncated, { count: numberFormat(this.lang).format(events.length) }) : "";
      const imported = this.calIcsErrors?.join(" ") || "";
      setText(this.calNoticeElement, [sticky, truncated, imported].filter(Boolean).join(" ")); this.calNoticeElement.hidden = !sticky && !truncated && !imported;
      this.calNoticeElement.classList.toggle("cx-cal-error", !!sticky || !!imported);
      this.calPaint(options);
      this.host.setAttribute("data-cx-calendar-ready", "true");
      this.emit("calendar", this.calSnapshot());
    },

    /** Shows a notice; a sticky one (an edit's refusal or failure) outlives reloads of the same period. Clearing clears it. */
    calNotice(text, error, sticky) {
      this.calSticky = sticky && text ? { text, at: this.calStickyKey() } : text ? this.calSticky : null;
      setText(this.calNoticeElement, text); this.calNoticeElement.hidden = !text;
      this.calNoticeElement.classList.toggle("cx-cal-error", !!error);
    },
    calStickyKey() { return [this.calView, this.calRange?.firstDay, this.calRange?.lastDay, this.calZoom].join("|"); }
  });
