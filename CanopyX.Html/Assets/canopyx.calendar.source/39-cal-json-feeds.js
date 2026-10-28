  // ---------- calendar: bounded, range-aware JSON feeds ----------
  Object.assign(DataGrid.prototype, {
    /** Each source is independent; hidden sources make no request and an obsolete range cannot install its answer. */
    async calLoadJson(from, to, signal) {
      const rows = [], errors = [], cache = this.calJsonCache ||= new Map(), budget = { bytes: 0, rows: 0, limit: this.cal.limit };
      const sources = this.cal.sources.filter(source => source.url && !this.calHiddenSources.has(source.id));
      let next = 0;
      const load = async source => {
        const url = new URL(source.url, location.href);
        for (const [key, value] of Object.entries(source.fetchParams)) url.searchParams.set(key, value);
        url.searchParams.set("start", calIso(from)); url.searchParams.set("end", calIso(to)); url.searchParams.set("timeZone", this.calZone.name);
        const key = source.id + ":" + url.href;
        try {
          let entry = cache.get(key);
          if (!entry) {
            if (url.origin !== location.origin || !["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("JSON feeds need a same-origin http(s) page.");
            const response = await fetch(url.href, { signal, credentials: "same-origin", redirect: "error", headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const body = await calJsonText(response, signal, budget);
            const items = calJsonRows(JSON.parse(body.text), source.id);
            calJsonCharge(budget, 0, items.length);
            if (signal.aborted) throw new DOMException("Aborted", "AbortError");
            entry = { items, bytes: body.bytes }; cache.set(key, entry);
            while (cache.size > 12) cache.delete(cache.keys().next().value);
          } else calJsonCharge(budget, entry.bytes, entry.items.length);
          rows.push(...entry.items);
        } catch (error) {
          if (signal.aborted || error.name === "AbortError") throw error;
          errors.push(source.label + ": " + error.message);
          this.emit("error", { error, source: source.id });
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, sources.length) }, async () => {
        while (next < sources.length && !budget.problem) await load(sources[next++]);
      }));
      return { rows, errors };
    }
  });
  /** Refuse oversized responses during reading, rather than after allocating an unbounded body. */
  async function calJsonText(response, signal, budget) {
    const max = 8000000;
    if (Number(response.headers.get("content-length")) > max) throw new Error("JSON feed exceeds 8 MB.");
    if (!response.body?.getReader) {
      const text = await response.text(); if (text.length > 2000000) throw new Error("JSON feed exceeds 2 million characters.");
      const bytes = new TextEncoder().encode(text).byteLength; calJsonCharge(budget, bytes, 0); return { text, bytes };
    }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let bytes = 0, text = "";
    try {
      for (;;) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > max) throw new Error("JSON feed exceeds 8 MB.");
        calJsonCharge(budget, chunk.value.byteLength, 0);
        text += decoder.decode(chunk.value, { stream: true });
        if (text.length > 2000000) throw new Error("JSON feed exceeds 2 million characters.");
      }
      return { text: text + decoder.decode(), bytes };
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  /** Cached and streamed sources share one reload budget; exhausted workers stop before starting another source. */
  function calJsonCharge(budget, bytes, rows) {
    budget.problem ||= budget.bytes + bytes > 16000000 ? "JSON feeds exceed the combined 16 MB limit." :
      budget.rows + rows > budget.limit ? "JSON feeds exceed the combined event limit of " + budget.limit + "." : null;
    if (budget.problem) throw new Error(budget.problem);
    budget.bytes += bytes; budget.rows += rows;
  }
  /** Feed values are text/data only. Namespaced identities keep different sources and grid records independent. */
  function calJsonRows(items, source) {
    if (!Array.isArray(items) || items.length > 5000) throw new Error("A JSON feed is an array of at most 5,000 events.");
    const ids = new Set(), identity = id => "json:" + JSON.stringify([source, id]);
    return items.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.title !== "string" || item.title.length > 1000 ||
          typeof item.start !== "string" || !Number.isFinite(calInstant(item.start.length === 10 ? item.start + "T00:00:00Z" : item.start)) ||
          item.end != null && (typeof item.end !== "string" || !Number.isFinite(calInstant(item.end.length === 10 ? item.end + "T00:00:00Z" : item.end)))) throw new Error("A JSON event needs a title and ISO start/end values.");
      const id = item.id ?? String(index + 1);
      if (typeof id !== "string" || !CAL_ID.test(id) || ids.has(id)) throw new Error("JSON event ids must be unique identifiers.");
      ids.add(id);
      for (const name of ["description", "resource", "recurrence", "exceptions", "series", "recurrenceId"]) if (item[name] != null && (typeof item[name] !== "string" || item[name].length > 10000)) throw new Error("Invalid JSON event " + name + ".");
      if (item.allDay !== undefined && typeof item.allDay !== "boolean") throw new Error("JSON allDay is a boolean.");
      const allDay = item.allDay ?? item.start.length === 10, normalize = value => value?.length === 10 ? value + "T00:00:00Z" : value;
      return { id: identity(id), external: source, cells: {}, fields: { title: item.title, start: normalize(item.start), end: normalize(item.end), allDay,
        description: item.description || "", resource: item.resource || null, resourceIds: calResourceIds(item.resourceIds), recurrence: item.recurrence,
        exceptions: item.exceptions, series: item.series ? identity(item.series) : null, recurrenceId: normalize(item.recurrenceId) } };
    });
  }
