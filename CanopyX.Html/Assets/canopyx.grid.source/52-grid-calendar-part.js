  // ---------- calendar: a calendar of the grid's records comes with a part (docs/calendar.md) ----------
  // A grid whose view declares calendar shows its records as a calendar (month, week, day, N days, agenda, year and, with
  // resources, the resource timeline) from canopyx-calendar.js, with canopyx-timeline.js, canopyx-calendar-recurrence.js,
  // canopyx-calendar-edit.js and canopyx-calendar-ics.js for definitions that use them (Build/parts.json). The part loads
  // before the first query, so the first paint is the calendar; until it is in, the calendar methods load it first.
  const GRID_CALENDAR = definePart(DataGrid, "calendar", "calendar", () => ({ DataGrid, h, setText, fill, plural, gridButton, gridIcon, gridFreeze, cellText,
    cellValue, isCellObject, gridQuery, gridQueryRows, gridResultShape, gridPresenterTone, validateGridRows, repairGridCell, validateGridPage, validateGridCursorPage, validStructuralCount, checkDocument,
    numberFormat, loadPart, HostCellContext, disposeHostSlot, PROTOCOL, toneVariable, bindContextMenu }));
  definePart(DataGrid, "timeline", "resource timeline", () => ({ DataGrid, TreeGrid, h, setText, fill, numberFormat, toneVariable }));
  // What a basic calendar does not use loads only for definitions that need it: recurrence, editing and iCalendar.
  definePart(DataGrid, "calendar-recurrence", "calendar recurrence", () => ({ DataGrid }));
  definePart(DataGrid, "calendar-edit", "calendar editing", () => ({ DataGrid, h, setText, fill, cellValue, GRID_DRAG }));
  definePart(DataGrid, "calendar-ics", "iCalendar", () => ({ DataGrid, h, fill, cellText }));
  const GRID_CALENDAR_API = ["getCalendar", "setCalendarView", "setCalendarDate", "setCalendarZoom", "calendarStep", "calendarToday", "getCalendarEvents",
    "exportCalendar", "openCalendarEvent", "editCalendarOccurrence", "clearCalendarSelection", "setCalendarSource"];
  for (const name of GRID_CALENDAR_API) DataGrid.prototype[name] = function (...args) { return this.loadCalendar().then(() => this[name](...args)); };
  DataGrid.prototype.loadCalendar = function () {
    return this.calLoad ||= loadPart(GRID_CALENDAR).then(() => this.destroyed || this.calParts()).then(() => this.destroyed || this.startCalendar()).catch(error => { this.calLoad = null; this.emit("error", { error }); throw error; });
  };
  const GRID_CALENDAR_INIT = DataGrid.prototype.initializeState;
  DataGrid.prototype.initializeState = function () {
    const start = () => GRID_CALENDAR_INIT.call(this);
    return this.view.calendar ? this.loadCalendar().then(start, start) : start();
  };
  // ---------- a basic calendar: events in, no grid schema to write (docs/calendar.md#quick-start) ----------
  // createCalendar builds the grid document of a list of events and mounts it. Presets set defaults that each option overrides:
  // basic (calendar controls only, read-only, a details popover), standard (search, filters and export) and scheduler
  // (editing, creating, the record drawer and, with resources, the timeline). Everything else a grid offers stays reachable
  // through calendar (any calendar key) and the grid options passed along.
  const CAL_PRESETS = {
    basic: { toolbar: false, details: "popover", views: ["month", "week", "day", "agenda"] },
    standard: { toolbar: ["search", "filters", "export"], details: "popover", print: true, views: ["month", "week", "day", "days", "agenda", "year"] },
    scheduler: { toolbar: ["search", "filters", "views", "export"], details: "drawer", print: true, editable: true, create: true, views: ["month", "week", "day", "agenda"] }
  };
  const CAL_FIELDS = ["allDay", "description", "tone", "resource", "resourceIds", "recurrence", "exceptions", "series", "recurrenceId", "source"];
  const CAL_TITLES = { allDay: "All day", description: "Description", tone: "Tone", resource: "Resource", resourceIds: "Resources", series: "Series", recurrenceId: "Original start", recurrence: "Repeats", exceptions: "Exceptions", source: "Source" };
  const CAL_OWN = new Set(["events", "preset", "id", "label", "views", "view", "date", "timeZone", "firstDay", "toolbar", "details", "editable", "create", "drop",
    "resources", "timeline", "live", "facets", "drawer", "export", "print", "sources", "calendar", "links"]);
  const calPad = (value, size = 2) => String(value).padStart(size, "0");
  /** An event's start or end as the grid writes it: an all-day value is the date it names in the reader's own calendar. */
  function calInstantText(value, field, allDay) {
    if (value instanceof Date && Number.isFinite(value.getTime()))
      return allDay ? calPad(value.getFullYear(), 4) + "-" + calPad(value.getMonth() + 1) + "-" + calPad(value.getDate()) + "T00:00:00Z" : value.toISOString().replace(".000Z", "Z");
    if (typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value)) return value + "T00:00:00Z";
    if (typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(value)) return allDay ? value.slice(0, 10) + "T00:00:00Z" : value;
    // A date and time without a zone is the reader's own wall time.
    const parsed = typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value) ? new Date(value) : null;
    if (parsed && Number.isFinite(parsed.getTime())) return calInstantText(parsed, field, allDay);
    throw new Error("CanopyX: a calendar event's " + field + " is a Date or an ISO date or date and time.");
  }
  function createCalendar(host, options = {}) {
    const preset = CAL_PRESETS[options.preset ?? "basic"];
    if (!preset) throw new Error("CanopyX: calendar presets are basic, standard and scheduler.");
    const events = options.events ?? [];
    if (!Array.isArray(events) || events.length > 100000) throw new Error("CanopyX: calendar events are an array of at most 100,000 events.");
    // calendar takes any calendar key; its functions (render, menu, occurrence) are the host's hooks of the grid options.
    const hooks = {}, own = {};
    for (const [name, value] of Object.entries(options.calendar || {})) (typeof value === "function" ? hooks : own)[name] = value;
    const pick = name => own[name] !== undefined ? own[name] : options[name] !== undefined ? options[name] : preset[name];
    const editable = !!pick("editable"), create = pick("create"), drop = !!pick("drop"), used = new Set(), ids = new Set();
    const rows = events.map((event, index) => {
      if (!event || typeof event !== "object" || typeof event.title !== "string") throw new Error("CanopyX: calendar event " + (index + 1) + " needs a title.");
      const id = event.id === undefined ? "e" + (index + 1) : String(event.id);
      if (ids.has(id)) throw new Error("CanopyX: calendar event ids are unique; '" + id + "' repeats.");
      ids.add(id);
      const allDay = event.allDay ?? (typeof event.start === "string" && event.start.length === 10);
      const cells = { title: event.title, start: calInstantText(event.start, "start", allDay) };
      if (event.end != null) cells.end = calInstantText(event.end, "end", allDay);
      if (allDay) { cells.allDay = true; used.add("allDay"); }
      for (const field of CAL_FIELDS) if (field !== "allDay" && event[field] != null) { cells[field] = field === "resourceIds" ? JSON.stringify(event[field]) : field === "recurrenceId" ? calInstantText(event[field], field, false) : String(event[field]); used.add(field); }
      return { id, cells };
    });
    if (options.resources) used.add("resource");
    if (used.has("recurrence")) for (const field of ["series", "recurrenceId", "exceptions"]) used.add(field);
    if (pick("sources")) used.add("source");
    // Creating or dropping all-day events needs the all-day column, though no event uses it yet.
    if (drop || create && !(typeof create === "object" && create.allDay === false)) used.add("allDay");
    const writable = editable || !!create || drop;
    const columns = [{ id: "title", title: "Title", kind: "text", rowHeader: true, sortable: true, editable: writable },
      { id: "start", title: "Start", kind: "datetime", sortable: true, editable: writable }, { id: "end", title: "End", kind: "datetime", sortable: true, editable: writable },
      ...CAL_FIELDS.filter(field => used.has(field)).map(field => ({ id: field, title: CAL_TITLES[field], kind: field === "recurrenceId" ? "datetime" : "text", hidden: field !== "description",
        editable: writable && (field === "resource" || field === "resourceIds" || field === "series" || field === "recurrenceId" || field === "allDay" || field === "recurrence" || field === "exceptions") }))];
    // export: true adds the Export control, false takes it away, whatever the preset's toolbar.
    let toolbar = pick("toolbar");
    if (options.export === true && toolbar !== true) toolbar = toolbar === false ? ["export"] : toolbar.includes("export") ? toolbar : [...toolbar, "export"];
    if (options.export === false && toolbar !== false) toolbar = (toolbar === true ? ["search", "filters", "columns", "views", "more"] : toolbar.filter(item => item !== "export"));
    if (Array.isArray(toolbar) && !toolbar.length) toolbar = false;
    const calendar = { start: "start", end: "end", title: "title", views: pick("views"), toolbar, details: options.drawer === true ? "drawer" : options.drawer === false ? "popover" : pick("details") };
    for (const field of CAL_FIELDS) if (used.has(field)) calendar[field] = field;
    for (const name of ["view", "date", "timeZone", "firstDay", "sources"]) if (options[name] !== undefined) calendar[name] = options[name];
    if (editable) calendar.editable = typeof pick("editable") === "object" ? pick("editable") : true;
    if (create) calendar.create = create;
    if (drop) calendar.drop = true;
    if (pick("print")) calendar.print = true;
    // A timeline joins the views the preset chose, never a list the host gave.
    const ownViews = own.views !== undefined || options.views !== undefined, addTimeline = () => { if (!ownViews && !calendar.views.includes("timeline")) calendar.views = [...calendar.views, "timeline"]; };
    if (options.resources) {
      // Resources: a tree view document, or a plain list of { id, label, parent? }.
      const list = options.resources, tree = Array.isArray(list) ? { protocol: PROTOCOL, type: "view", id: "resources", label: "Resources", rowHeight: 34, pageSize: 200, selection: "single",
        columns: [{ id: "name", title: "Resource", kind: "text", width: 200 }], source: { kind: "inline" }, roots: calResourceRoots(list) } : list;
      calendar.resources = { view: tree };
      if (options.timeline !== false && (options.timeline || options.preset === "scheduler")) addTimeline();
      if (options.preset === "scheduler") calendar.capacity = { thresholds: [{ at: 3, tone: "warning" }, { at: 5, tone: "danger" }] };
    } else if (options.timeline) addTimeline();
    for (const [name, value] of Object.entries(own)) if (!["toolbar", "editable", "create", "drop"].includes(name)) calendar[name] = value;
    if (calendar.toolbar === true) delete calendar.toolbar;
    if (calendar.details === "drawer") delete calendar.details;
    const search = calendar.toolbar === undefined || calendar.toolbar !== false && calendar.toolbar.includes("search");
    const view = { protocol: PROTOCOL, type: "grid", id: options.id ?? "calendar", label: options.label ?? "Calendar", rowHeight: 34, pageSize: 200, selection: "single",
      search, columns, source: { kind: "inline" }, rows, calendar };
    if (options.live) view.live = options.live === true ? {} : options.live;
    if (options.facets) view.facets = Array.isArray(options.facets) ? { columns: options.facets } : options.facets;
    const hostOptions = Object.fromEntries(Object.entries(options).filter(([name]) => !CAL_OWN.has(name)));
    if (options.links) hostOptions.linkEvents = true;
    if (Object.keys(hooks).length) hostOptions.calendar = hooks;
    return createDataGrid(host, { ...hostOptions, view });
  }
  /** Resource roots from a plain list: { id, label, parent? }, parents before or after their children. */
  function calResourceRoots(list) {
    const nodes = new Map(list.map(item => [String(item.id), { id: String(item.id), label: String(item.label ?? item.id), cells: { name: String(item.label ?? item.id) }, expanded: true }])), roots = [];
    for (const item of list) {
      const node = nodes.get(String(item.id)), parent = item.parent == null ? null : nodes.get(String(item.parent));
      if (parent) (parent.children ||= []).push(node); else roots.push(node);
    }
    return roots;
  }
