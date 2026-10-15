  // ---------- the controller: the grid's API plus events by short name, records and the restored table ----------
  // on(name, handler) takes init, draw, order, search, page and length, which follow each accepted query, and every event
  // the grid dispatches as canopyx:<name> (select, state, error, rowActivate, link, ...). Handlers receive the event's
  // detail and the controller. Records come back as they were given: the objects or arrays of data, or a table row's cell texts.
  function enhanceEvents(host, initial) {
    const handlers = new Map(), listening = new Set(), lifetime = new AbortController();
    let controller = null, api = null, previous = null, initialized = false;
    const emit = (name, detail, event) => {
      for (const handler of [...(handlers.get(name) || [])]) {
        try { handler.call(controller, detail, controller, event); } catch (error) { global.console?.error(error); }
      }
    };
    const on = (name, handler) => {
      if (typeof name !== "string" || !/^[A-Za-z][\w-]*$/.test(name) || typeof handler !== "function") throw new Error("CanopyX: on takes an event name and a function.");
      (handlers.get(name) || handlers.set(name, new Set()).get(name)).add(handler);
      if (!ENHANCE_DERIVED.includes(name) && !listening.has(name)) {
        listening.add(name);
        host.addEventListener("canopyx:" + name, event => emit(name, event.detail, event), { signal: lifetime.signal });
      }
      if (name === "init" && initialized) Promise.resolve().then(() => handler.call(controller, { query: api.getQuery() }, controller));
    };
    host.addEventListener("canopyx:query", event => {
      if (!api) return;
      const query = event.detail.query, paging = api.getPaging(), before = previous, detail = { query, paging };
      const same = (left, right) => JSON.stringify(left === undefined ? null : left) === JSON.stringify(right === undefined ? null : right);
      previous = detail;
      if (before) {
        if (!same(before.query.sort, query.sort)) emit("order", detail, event);
        if (before.query.search !== query.search || !same([before.query.filters, before.query.filterGroup], [query.filters, query.filterGroup])) emit("search", detail, event);
        if (before.paging.pageLength !== paging.pageLength) emit("length", detail, event);
        if (before.paging.pageIndex !== paging.pageIndex) emit("page", detail, event);
      }
      emit("draw", detail, event);
    }, { signal: lifetime.signal });
    if (initial !== undefined) {
      if (initial === null || typeof initial !== "object") throw new Error("CanopyX: on is an object of handlers by event name.");
      for (const [name, handler] of Object.entries(initial)) on(name, handler);
    }
    return {
      on, off: (name, handler) => { handlers.get(name)?.delete(handler); }, abort: () => lifetime.abort(),
      start(created, grid) {
        controller = created; api = grid;
        api.ready.then(query => { if (lifetime.signal.aborted) return; initialized = true; emit("init", { query }); }, () => {});
      }
    };
  }

  function enhanceController({ api, element, host, isTable, read, columns, store, rowSource, server, events, settings, caption, footer, restore }) {
    let destroyed = false;
    const recordOf = row => store.records && store.records.has(row.id) ? store.records.get(row.id) : store.tableRecord ? store.tableRecord(row.id) : undefined;
    const local = name => { if (server) throw new Error("CanopyX: " + name + " changes inline data; a server source changes on the server, then reload()."); };
    // New data keeps the accepted sort, search, filters and page; the page is clamped when it no longer exists.
    const refresh = () => {
      store.version++;
      if (store.grid) store.grid.view.rows = store.rows;
      // All rows stays all rows: its page length follows the new row count.
      const query = api.getQuery();
      return !query ? api.reload() : store.grid && store.grid.pageAll ? api.setPageLength("all") : api.setQuery({ ...query, revision: undefined });
    };
    // The grid's API is frozen, so the controller inherits it and defines its own members rather than assigning over them.
    const own = {
      /** The original table, restored by destroy(); null for a grid built in another element. */
      table: isTable ? element : null,
      /** Header rows above the bottom one, as levels of { title, columns }. */
      headerGroups: read ? enhanceHeaderGroups(read, columns.map(column => column.grid.id)) : [],
      on(name, handler) { events.on(name, handler); return controller; },
      off(name, handler) { events.off(name, handler); return controller; },
      /** Records in the source order ("all"), in the accepted result order ("filtered"), or on the visible page ("page"). */
      getRows(scope = "all") {
        if (!["all", "filtered", "page"].includes(scope)) throw new Error("CanopyX: getRows takes all, filtered or page.");
        const query = api.getQuery();
        let rows = store.rows;
        if (!server && scope !== "all") {
          rows = query ? rowSource.order(query) : [];
          if (scope === "page") { const paging = api.getPaging(); rows = rows.slice(Math.max(0, paging.first - 1), paging.last); }
        }
        return rows.map(recordOf);
      },
      getRow(id) { const row = store.rows.find(item => item.id === id); return row ? recordOf(row) : undefined; },
      setData(data) {
        local("setData");
        const built = enhanceRecordRows(data, columns, settings.rowId);
        Object.assign(store, { rows: built.rows, records: built.records, markup: null, tableRecord: null });
        return refresh();
      },
      addRows(data) {
        local("addRows");
        const built = enhanceRecordRows(data, columns, settings.rowId, store.rows.length, new Set(store.rows.map(row => row.id)));
        store.rows = store.rows.concat(built.rows); built.records.forEach((record, id) => store.records.set(id, record));
        return refresh();
      },
      removeRows(ids) {
        local("removeRows");
        if (!Array.isArray(ids)) throw new Error("CanopyX: removeRows takes an array of row ids.");
        const gone = new Set(ids);
        store.rows = store.rows.filter(row => !gone.has(row.id));
        gone.forEach(id => { store.records.delete(id); store.markup?.delete(id); });
        return refresh();
      },
      /** Destroys the grid and puts the original table back exactly as it was. */
      destroy() {
        if (destroyed) return;
        destroyed = true; events.abort(); api.destroy(); caption?.remove(); footer?.remove(); restore();
        ENHANCE_CONTROLLERS.delete(element); ENHANCE_CONTROLLERS.delete(host);
        if (isTable) host.replaceWith(element);
      }
    };
    const controller = Object.freeze(Object.create(api, Object.getOwnPropertyDescriptors(own)));
    return controller;
  }
