  // ---------- state saving: session or local storage with a duration, the address, or the host's own store ----------
  // stateSave keeps what the grid already saves (sort, search, filters, page, page length, column widths, order and
  // visibility, selection and named views) between visits. The address form carries only what a shared link needs: the
  // sort, search, filters, page and page length. A state in the address wins over a stored one.
  // A host may write asynchronously. Keep one active write and only the latest queued envelope per backing key, including
  // the final write on destroy. Entries leave the map when settled; a new controller reads after those writes finish.
  const ENHANCE_STATE_WRITES = new Map();
  function enhanceWriteState(settings, envelope) {
    let entry = ENHANCE_STATE_WRITES.get(settings.key);
    if (entry) { entry.next = { settings, envelope }; return; }
    entry = { next: { settings, envelope }, done: null };
    ENHANCE_STATE_WRITES.set(settings.key, entry);
    entry.done = Promise.resolve().then(async () => {
      while (entry.next) {
        const { settings, envelope } = entry.next; entry.next = null;
        try { await settings.save({ key: settings.key, view: settings.view, state: envelope }); }
        catch (_) { /* A failed host write does not discard a later queued state. */ }
      }
      ENHANCE_STATE_WRITES.delete(settings.key);
    });
  }
  function enhanceStateSettings(value, view) {
    if (value === undefined || value === null || value === false) return null;
    const options = value === true ? {} : value;
    if (typeof options !== "object" || Array.isArray(options) || options.storage !== undefined && !["session", "local"].includes(options.storage) ||
        options.duration !== undefined && !(typeof options.duration === "number" && options.duration >= 0) ||
        options.url !== undefined && ![false, "query", "hash"].includes(options.url) ||
        ["load", "save"].some(name => options[name] !== undefined && typeof options[name] !== "function") ||
        ["key", "parameter"].some(name => options[name] !== undefined && (typeof options[name] !== "string" || !options[name])))
      throw new Error("CanopyX: stateSave is true or { storage?, duration?, key?, url?, parameter?, load?, save? }.");
    return { storage: options.storage || "session", duration: options.duration === undefined ? 7200 : options.duration, url: options.url || false,
      key: "cx:state:" + (options.key || global.location.pathname) + ":" + view.id, parameter: options.parameter || view.id, load: options.load, save: options.save,
      timeZone: view.timeZone === "local" ? "local" : "utc", view: view.id, pageLength: view.pageLength };
  }

  function enhanceStorage(settings) {
    try { return global[settings.storage + "Storage"]; } catch (_) { return null; }
  }

  /**
   * The address's parameters: the query string, or the fragment read as one. A fragment that is not name=value pairs (an
   * anchor, or a route such as #/orders/5) belongs to the page: the state is then neither read from it nor written to it.
   */
  function enhanceAddress(settings) {
    const url = new URL(global.location.href), fragment = url.hash.slice(1);
    if (settings.url === "hash" && fragment && !/^[^=&#\/]+=[^&]*(?:&[^=&#\/]+=[^&]*)*$/.test(fragment)) return null;
    return { url, params: settings.url === "hash" ? new URLSearchParams(fragment) : url.searchParams };
  }

  /** Reads the saved state: the stored envelope while it is younger than the duration, then a shared state from the address. */
  async function enhanceLoadState(settings) {
    let envelope = null;
    try {
      const pending = ENHANCE_STATE_WRITES.get(settings.key);
      if (pending) await pending.done;
      envelope = settings.load ? await settings.load({ key: settings.key, view: settings.view }) : JSON.parse(enhanceStorage(settings)?.getItem(settings.key) || "null");
    } catch (_) { envelope = null; }
    if (!envelope || typeof envelope !== "object" || settings.duration && !(Number.isFinite(envelope.time) && Date.now() - envelope.time <= settings.duration * 1000)) envelope = null;
    let shared = null;
    if (settings.url) {
      try { shared = JSON.parse(enhanceAddress(settings)?.params.get(settings.parameter) || "null"); } catch (_) { shared = null; }
    }
    if (shared && typeof shared === "object" && !Array.isArray(shared)) {
      const base = envelope && envelope.current && typeof envelope.current === "object" ? envelope.current :
        { version: 1, view: settings.view, columns: [], timeZone: settings.timeZone, selection: [], scrollTop: 0, query: {} };
      const sort = Array.isArray(shared.s) ? shared.s.filter(Array.isArray).map(([column, direction]) => ({ column, direction })) : [];
      const query = { ...base.query, sort, search: typeof shared.q === "string" ? shared.q : "", filters: Array.isArray(shared.f) ? shared.f : [] };
      if (shared.g && typeof shared.g === "object") query.filterGroup = shared.g; else delete query.filterGroup;
      if (Array.isArray(shared.t) && shared.t.length) query.tupleFilters = shared.t; else delete query.tupleFilters;
      const paging = { pageLength: Number.isInteger(shared.l) ? shared.l : base.paging?.pageLength || settings.pageLength || 50, offset: Number.isInteger(shared.o) ? shared.o : 0 };
      if (shared.a === true) paging.allRows = true;
      envelope = { ...envelope, current: { ...base, query, paging, scrollTop: 0 } };
    }
    return envelope;
  }

  /** Writes the envelope the grid keeps (current state and named views), and the shared part of the state to the address. */
  function enhanceSaveState(settings, envelope) {
    envelope.time = Date.now();
    try {
      if (settings.save) enhanceWriteState(settings, envelope);
      else enhanceStorage(settings)?.setItem(settings.key, JSON.stringify(envelope));
    } catch (_) { /* A full or blocked store leaves the grid usable. */ }
    if (!settings.url) return;
    const query = envelope.current.query, paging = envelope.current.paging || {}, shared = {};
    if (query.sort.length) shared.s = query.sort.map(sort => [sort.column, sort.direction]);
    if (query.search) shared.q = query.search;
    if (query.filters.length) shared.f = query.filters;
    if (query.filterGroup) shared.g = query.filterGroup;
    if (query.tupleFilters?.length) shared.t = query.tupleFilters;
    if (paging.offset) shared.o = paging.offset;
    if (paging.pageLength && paging.pageLength !== settings.pageLength) shared.l = paging.pageLength;
    if (paging.allRows) shared.a = true;
    const address = enhanceAddress(settings);
    if (!address) return;
    const { url, params } = address, text = Object.keys(shared).length ? JSON.stringify(shared) : null;
    if (params.get(settings.parameter) === text) return;
    if (text === null) params.delete(settings.parameter); else params.set(settings.parameter, text);
    if (settings.url === "hash") url.hash = params.toString();
    try { global.history.replaceState(global.history.state, "", url.href); } catch (_) { /* Sandboxed documents cannot change their address. */ }
  }

  /** Points a new grid's state reads and writes at these settings; the grid calls them as it would its session store. */
  function enhanceStateStore(grid, settings, envelope) {
    grid.readStoredState = () => envelope;
    grid.writeStoredState = function (state) {
      if (this.destroyed) return;
      enhanceSaveState(settings, { current: state, views: [...this.savedViews].map(([name, value]) => ({ name, state: value })) });
    };
  }
