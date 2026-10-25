  // ---------- CanopyX.enhance and CanopyX.grid ----------
  // Options are read once: a table's data-* attributes first, then the script options, which win. The result is an ordinary
  // grid definition handed to createDataGrid, so every grid feature (menus, filters, export, views, keyboard, phone layout)
  // works the same; the controller adds header groups, short event names and record access on top of the grid's API.
  const ENHANCE_OPTIONS = ["id", "label", "noun", "columns", "data", "url", "serverSide", "rowId", "paging", "pageLength", "pageLengths", "lengthMenu", "info",
    "pageNumbers", "pageInput", "firstLast", "search", "searchText", "searchMode", "order", "sortable", "selection", "stateSave", "texts", "markup", "footer", "height",
    "theme", "density", "zebra", "view", "on"];
  // Short text names for the labels people change most; unknown names are ignored. labels takes every CanopyX label.
  const ENHANCE_TEXTS = { search: "searchPlaceholder", info: "gridPageInfo", infoFiltered: "gridPageInfoFiltered", lengthMenu: "gridPageLength",
    first: "gridFirstPage", previous: "gridPreviousPage", next: "gridNextPage", last: "gridLastPage", page: "gridPageButton", all: "gridAll",
    empty: "gridEmpty", emptyReason: "gridEmptyReason", noMatches: "gridNoMatches", loading: "loading", loadFailed: "gridLoadFailed", retry: "gridRetry" };
  // Events derived from each accepted query, beside the grid's own canopyx:* events, which on() also takes by name.
  const ENHANCE_DERIVED = ["init", "draw", "order", "search", "page", "length"];
  const ENHANCE_SETUP = new WeakMap(), ENHANCE_CONTROLLERS = new WeakMap(), ENHANCE_PENDING = new WeakMap();
  let enhanceSeq = 0;

  // A grid built here gets its rows and its state store before it reads either (prepareState runs in the constructor).
  const ENHANCE_PREPARE = DataGrid.prototype.prepareState;
  DataGrid.prototype.prepareState = function () {
    const setup = ENHANCE_SETUP.get(this.opts);
    if (setup) setup(this);
    return ENHANCE_PREPARE.call(this);
  };

  /** The page-order initial sort: [[column index or id, "asc" | "desc"], ...] or [{ column, direction }, ...]. */
  function enhanceOrder(order, columns) {
    if (order === undefined || order === null) return [];
    if (!Array.isArray(order)) throw new Error("CanopyX: order is a list of [column, direction] pairs.");
    return order.map(entry => {
      const [reference, direction = "asc"] = Array.isArray(entry) ? entry : [entry && entry.column, entry && entry.direction];
      const column = typeof reference === "number" ? columns[reference] : columns.find(item => item.grid.id === reference);
      if (!column || !column.grid.sortable || !["asc", "desc"].includes(direction)) throw new Error("CanopyX: order names an unknown or unsortable column.");
      return { column: column.grid.id, direction };
    });
  }

  /** The pager settings of the short paging options. Numbered pages and the result sentence are on unless switched off. */
  function enhancePager(settings) {
    const pager = { lengths: settings.pageLengths === undefined ? [10, 25, 50, 100, "all"] : settings.pageLengths };
    const numbers = settings.pageNumbers === undefined || settings.pageNumbers === true ? 7 : settings.pageNumbers === false ? 0 : settings.pageNumbers;
    if (numbers) pager.numbers = numbers;
    for (const name of ["lengthMenu", "pageInput", "firstLast"]) if (settings[name] !== undefined) pager[name] = settings[name];
    pager.info = settings.info === false ? "none" : settings.info === undefined || settings.info === true ? "sentence" : settings.info;
    return pager;
  }

  function enhanceLabels(settings) {
    const labels = {};
    if (settings.texts && typeof settings.texts === "object")
      for (const [name, text] of Object.entries(settings.texts)) if (Object.hasOwn(ENHANCE_TEXTS, name) && typeof text === "string") labels[ENHANCE_TEXTS[name]] = text;
    return Object.assign(labels, settings.labels);
  }

  // The kept caption and footer are styled in place with the theme's custom properties, so the part needs no stylesheet.
  const ENHANCE_STYLES = {
    caption: "flex:none;padding:var(--cx-size-10px) var(--cx-size-12px) var(--cx-size-2px);color:var(--hfx-color-text);font-size:var(--cx-size-14px);font-weight:600;line-height:1.35",
    foot: "flex:none;display:flex;flex-direction:column;gap:var(--cx-size-4px);padding:var(--cx-size-8px) var(--cx-size-12px);border-top:var(--cx-size-1px) solid var(--hfx-color-border);color:var(--hfx-color-text-muted);font-size:var(--cx-size-13px)",
    row: "display:flex;flex-wrap:wrap;gap:var(--cx-size-4px) var(--cx-size-16px);margin:0",
    value: "color:var(--hfx-color-text);font-weight:600;font-variant-numeric:tabular-nums"
  };
  function enhanceStyled(tag, className, style) { const element = h(tag, className); element.style.cssText = ENHANCE_STYLES[style]; return element; }

  /** The table footer as a quiet strip below the rows: each value with its column's title, so it reads well at any width. */
  function enhanceFooter(rows, columns) {
    const foot = enhanceStyled("div", "cx-enhanced-foot", "foot");
    for (const values of rows) {
      const line = enhanceStyled("p", "cx-enhanced-foot-row", "row");
      values.forEach((text, index) => {
        if (!text) return;
        const item = h("span"), title = index && columns[index] ? columns[index].grid.title : "", value = enhanceStyled("b", "", "value");
        if (title) { const name = h("span"); setText(name, title + " "); item.appendChild(name); }
        setText(value, text); item.appendChild(value); line.appendChild(item);
      });
      if (line.firstChild) foot.appendChild(line);
    }
    return foot.firstChild ? foot : null;
  }

  // Calls for an element that is being enhanced share its promise; later calls find its controller.
  GRID_ENHANCE_IMPL.create = function (target, options, tableOnly) {
    const element = typeof target === "string" ? document.querySelector(target) : target;
    if (!element || element.nodeType !== 1) return Promise.reject(new Error("CanopyX: no element to build a grid in: " + target));
    if (ENHANCE_CONTROLLERS.has(element)) return Promise.resolve(ENHANCE_CONTROLLERS.get(element));
    if (!ENHANCE_PENDING.has(element)) ENHANCE_PENDING.set(element, enhanceCreate(element, options, tableOnly).finally(() => ENHANCE_PENDING.delete(element)));
    return ENHANCE_PENDING.get(element);
  };

  async function enhanceCreate(element, options, tableOnly) {
    const isTable = element.tagName === "TABLE";
    if (tableOnly && !isTable) throw new Error("CanopyX: enhance needs a <table>; CanopyX.grid builds a grid in any element.");
    if (!isTable && element.hasAttribute("data-canopyx-mounted")) throw new Error("CanopyX: this element already holds a grid.");
    if (options !== undefined && (options === null || typeof options !== "object" || Array.isArray(options))) throw new Error("CanopyX: grid options are an object.");
    const read = isTable ? enhanceReadTable(element) : null, settings = { ...read && read.options, ...options };
    const urlSource = settings.url === undefined ? null : enhanceUrlSource(settings.url), server = !!(urlSource && (settings.serverSide || urlSource.serverSide));
    if (settings.data !== undefined && !Array.isArray(settings.data)) throw new Error("CanopyX: data is an array of records.");
    let records = settings.data;
    const specs0 = read ? enhanceTableColumns(read, settings.columns) : settings.columns;
    // Without columns or declared types, a URL source is read first so its records can define them.
    const typed = Array.isArray(specs0) && specs0.every(spec => spec && spec.type !== undefined && spec.type !== "auto");
    if (urlSource && !server && records === undefined && !typed) {
      const timeout = settings.requestTimeoutMs === undefined ? 30000 : settings.requestTimeoutMs;
      if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2147483647) throw new Error("CanopyX: invalid grid cache or request timeout.");
      // Inference precedes the grid: its preparation has the same bounded request owner, without a second timer policy.
      const preparation = { lifetime: new AbortController(), destroyed: false, requestTimeoutMs: timeout };
      records = enhanceRecordsOf(await DataGrid.prototype.runGridHook.call(preparation,
        signal => enhanceRequest(urlSource, urlSource.url, enhanceExtra(urlSource), signal)), urlSource.dataSrc);
    }
    const columns = enhanceColumns(specs0 || enhanceRecordSpecs(records), settings.sortable !== false);
    if (server || urlSource && records === undefined) columns.forEach(column => { column.kind ||= "text"; column.grid.kind = column.kind; });
    const store = { rows: [], version: 0, loading: null, records: null, markup: null, grid: null };
    const built = records !== undefined ? enhanceRecordRows(records, columns, settings.rowId) : read && !urlSource ? enhanceTableRows(read, columns, settings.markup !== false) :
      { rows: [], records: new Map() };
    Object.assign(store, built);
    const id = settings.id || element.id || "grid-" + ++enhanceSeq;
    const label = String(settings.label || element.getAttribute("aria-label") || read && read.caption || element.getAttribute("title") || "Table");
    const paged = settings.paging !== false, pageLength = settings.pageLength === undefined ? 25 : settings.pageLength;
    const searchColumns = columns.filter(column => column.searchable).map(column => column.grid.id);
    const view = { protocol: PROTOCOL, type: "grid", id, label, columns: columns.map(column => column.grid), selection: settings.selection || "none",
      search: settings.search !== false && searchColumns.length > 0,
      // A server answers one page per request; browser-side rows are read in windows of at least 100.
      pageSize: Math.min(10000, Math.max(server && paged ? 1 : 100, Number.isInteger(pageLength) ? pageLength : 100)),
      source: { kind: server ? "host" : "inline" } };
    if (!server) view.rows = [];
    if (paged) Object.assign(view, { presentation: "paged", pageLength, pager: enhancePager(settings) });
    if (searchColumns.length && searchColumns.length < columns.length) view.searchColumns = searchColumns;
    for (const name of ["noun", "density", "zebra"]) if (settings[name] !== undefined) view[name] = settings[name];
    view.query = { sort: enhanceOrder(settings.order, columns), search: settings.searchText === undefined ? "" : String(settings.searchText) };
    if (settings.searchMode !== undefined) view.query.searchMode = settings.searchMode;
    // Header rows above the bottom one draw as the grid's column groups (multi-level headers).
    const groups = read ? enhanceColumnGroups(read, columns.map(column => column.grid.id)) : [];
    if (groups.length) view.columnGroups = groups;
    if (settings.view) Object.assign(view, settings.view);
    // Host options pass through: renderers, actions, plugins, exportFormats, toolbar, callbacks such as onQuery.
    const host = isTable ? h("div") : element, grid = {};
    for (const [name, value] of Object.entries(settings)) if (!ENHANCE_OPTIONS.includes(name) && name !== "labels") grid[name] = value;
    const labels = enhanceLabels(settings);
    if (Object.keys(labels).length) grid.labels = labels;
    const markup = store.markup && store.markup.size ? Object.fromEntries(columns.filter(column => [...store.markup.values()].some(cells => cells.has(column.grid.id)))
      .map(column => [column.grid.id, (row, cellElement) => {
        const cell = store.markup?.get(row.id)?.get(column.grid.id);
        if (cell) { cellElement.append(...Array.from(cell.childNodes, node => node.cloneNode(true))); return true; }
      }])) : null;
    if (markup || settings.renderers) grid.renderers = { ...markup, ...settings.renderers };
    const rowSource = server ? null : enhanceRowSource(store, view, GRID_REPORTING.compare?.(view) || gridCompare, view.searchColumns || searchColumns);
    grid.source = server ? enhanceServerSource(urlSource, view, columns, settings.rowId, store) : rowSource;
    if (urlSource && !server && records === undefined) enhanceReadOnce(store, urlSource, columns, settings.rowId);
    const state = enhanceStateSettings(settings.stateSave, { ...view, timeZone: settings.view && settings.view.timeZone }), envelope = state ? await enhanceLoadState(state) : null;
    ENHANCE_SETUP.set(grid, created => {
      store.grid = created;
      // The enhancer owns the complete local dataset despite supplying its page-order query source.
      if (!server) { created.enhanceStore = store; created.view.rows = store.rows; }
      if (state) enhanceStateStore(created, state, envelope);
    });
    // A page of rows shows whole, as the table did: the bound leaves room for up to 100 rows and the chrome, and the grid's
    // own auto height trims it to the rows a page has. Longer pages scroll inside the grid.
    const fit = length => { const height = "calc(" + Math.min(Math.max(length, 1), 100) + " * var(--cx-row-h, 34px) + 320px)"; if (host.style.height !== height) host.style.height = height; };
    // A host element of the page gets its own height and theme back on destroy.
    const height = host.style.height, theme = host.getAttribute("data-cx-theme");
    const restore = () => { host.style.height = height; if (theme === null) host.removeAttribute("data-cx-theme"); else host.setAttribute("data-cx-theme", theme); };
    if (settings.height) host.style.height = String(settings.height); else if (paged) fit(Number.isInteger(pageLength) ? pageLength : 25);
    if (settings.theme) host.setAttribute("data-cx-theme", String(settings.theme));
    let caption = null;
    if (read && read.caption) { caption = enhanceStyled("div", "cx-enhanced-caption", "caption"); setText(caption, read.caption); host.appendChild(caption); }
    if (isTable) element.replaceWith(host);
    let api, events;
    // The pager part loads once the table has left the page: its stylesheet then restyles the small grid host, not every row.
    try {
      events = enhanceEvents(host, settings.on);
      if (!settings.height && paged) events.on("draw", ({ paging }) => fit(paging.pageLength));
      await loadPart(GRID_PAGER); api = createDataGrid(host, Object.assign(grid, { view }));
    } catch (error) {
      events?.abort(); caption?.remove(); restore();
      if (isTable) host.replaceWith(element);
      throw error;
    }
    const footer = read && settings.footer !== false && !(settings.view && settings.view.reporting && settings.view.reporting.aggregates) ? enhanceFooter(read.footer, columns) : null;
    if (footer) host.querySelector(":scope > .cx-grid").after(footer);
    const controller = enhanceController({ api, element, host, isTable, read, columns, store, rowSource, server, events, settings, caption, footer, restore });
    host.canopyx = controller;
    ENHANCE_CONTROLLERS.set(element, controller);
    if (isTable) ENHANCE_CONTROLLERS.set(host, controller);
    events.start(controller, api);
    return controller;
  }
