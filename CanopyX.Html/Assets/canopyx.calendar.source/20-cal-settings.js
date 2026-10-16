  // ---------- calendar: the view's calendar settings, checked once (docs/calendar.md#the-calendar-definition) ----------
  // A grid's calendar field names the columns that hold each event's parts: start (a date column, required), end, title,
  // subtitle, allDay, resource, status, recurrence, exceptions, the series and recurrenceId of an overridden occurrence, display
  // ("background" marks a background range) and seriesEnd (what a server reads to find series in a range). The rest are the
  // views and how they look. Everything is optional except start; an unknown key or a column of the wrong kind is an error.
  const CAL_VIEWS = ["month", "week", "day", "days", "agenda", "year", "timeline"], CAL_ZOOMS = ["hour", "day", "week", "month", "quarter"];
  const CAL_KEYS = new Set(["start", "end", "title", "subtitle", "allDay", "resource", "status", "recurrence", "exceptions", "series", "recurrenceId", "display",
    "seriesEnd", "view", "views", "date", "days", "firstDay", "hiddenDays", "slotMinutes", "minTime", "maxTime", "scrollTime", "workingHours", "nowIndicator",
    "eventLimit", "eventStyle", "timeZone", "editable", "resources", "zoom", "zooms", "capacity", "ranges", "availability", "limit", "phone"]);
  const CAL_TONE = /^[a-z][a-z0-9-]{0,31}$/;

  function calInvalid(message) { throw new Error("CanopyX: " + message); }
  function calDays(list, name) {
    if (!Array.isArray(list) || list.length > 7 || new Set(list).size !== list.length || list.some(day => !Number.isInteger(day) || day < 0 || day > 6)) calInvalid(name + " lists weekdays 0 to 6.");
    return new Set(list);
  }
  function calTimeRange(value, name) {
    const start = calMinutes(value?.start), end = calMinutes(value?.end);
    if (!(start < end)) calInvalid(name + " needs a start before its end (HH:mm).");
    return { start, end };
  }

  /** Reads and checks a grid's calendar settings against its columns. */
  function calSettings(grid) {
    const input = grid.view.calendar, columns = new Map(grid.columns.map(column => [column.id, column]));
    if (!input || typeof input !== "object" || Array.isArray(input)) calInvalid("calendar settings are an object.");
    for (const key of Object.keys(input)) if (!CAL_KEYS.has(key)) calInvalid("calendar settings have no '" + key + "'.");
    const column = (name, kinds, required) => {
      const id = input[name];
      if (id === undefined && !required) return null;
      const found = columns.get(id);
      if (!found || kinds && !kinds.includes(found.kind)) calInvalid("calendar " + name + " names a " + (kinds ? kinds.join(" or ") + " " : "") + "column.");
      return found;
    };
    const settings = {
      start: column("start", ["datetime"], true), end: column("end", ["datetime"]), allDay: column("allDay", ["text"]),
      title: column("title") || grid.columns.find(item => item.rowHeader) || grid.columns.find(item => !item.hidden), subtitle: column("subtitle"),
      resource: column("resource", ["text"]), status: column("status"), recurrence: column("recurrence", ["text"]), exceptions: column("exceptions", ["text"]),
      series: column("series", ["text"]), recurrenceId: column("recurrenceId", ["datetime"]), display: column("display", ["text"]), seriesEnd: column("seriesEnd", ["datetime"])
    };
    if (!settings.series !== !settings.recurrenceId) calInvalid("calendar series and recurrenceId come together.");
    const views = input.views === undefined ? ["month", "week", "day", "agenda"].concat(input.resources ? ["timeline"] : []) : input.views;
    if (!Array.isArray(views) || !views.length || new Set(views).size !== views.length || views.some(view => !CAL_VIEWS.includes(view))) calInvalid("calendar views list unique views.");
    if (views.includes("timeline") && !input.resources) calInvalid("the timeline view needs calendar resources.");
    const view = input.view === undefined ? views[0] : input.view;
    if (!views.includes(view)) calInvalid("the calendar's first view must be one of its views.");
    settings.views = views; settings.view = view;
    settings.date = input.date === undefined ? null : calParseDay(input.date);
    if (Number.isNaN(settings.date)) calInvalid("calendar date is yyyy-MM-dd.");
    const integer = (name, min, max, fallback) => {
      const value = input[name] === undefined ? fallback : input[name];
      if (!Number.isInteger(value) || value < min || value > max) calInvalid("calendar " + name + " is an integer from " + min + " to " + max + ".");
      return value;
    };
    settings.days = integer("days", 2, 14, 3);
    settings.firstDay = input.firstDay === undefined ? calFirstDay(grid.lang) : integer("firstDay", 0, 6, 0);
    settings.hidden = input.hiddenDays === undefined ? new Set() : calDays(input.hiddenDays, "calendar hiddenDays");
    if (settings.hidden.size === 7) calInvalid("calendar hiddenDays must leave a day.");
    settings.slotMinutes = input.slotMinutes === undefined ? 30 : input.slotMinutes;
    if (![5, 10, 15, 20, 30, 60].includes(settings.slotMinutes)) calInvalid("calendar slotMinutes is 5, 10, 15, 20, 30 or 60.");
    const time = (name, fallback) => { const value = input[name] === undefined ? fallback : calMinutes(input[name]); if (Number.isNaN(value)) calInvalid("calendar " + name + " is HH:mm."); return value; };
    settings.minMinutes = time("minTime", 0); settings.maxMinutes = time("maxTime", 1440); settings.scrollMinutes = time("scrollTime", 480);
    if (settings.minMinutes >= settings.maxMinutes || settings.minMinutes % settings.slotMinutes || settings.maxMinutes % settings.slotMinutes)
      calInvalid("calendar minTime comes before maxTime, both on slot boundaries.");
    if (input.workingHours !== undefined) {
      const hours = input.workingHours;
      if (!hours || typeof hours !== "object" || Object.keys(hours).some(key => !["days", "start", "end"].includes(key))) calInvalid("calendar workingHours takes days, start and end.");
      settings.working = { ...calTimeRange(hours, "calendar workingHours"), days: calDays(hours.days === undefined ? [1, 2, 3, 4, 5] : hours.days, "calendar workingHours days") };
    } else settings.working = null;
    for (const name of ["nowIndicator"]) if (input[name] !== undefined && typeof input[name] !== "boolean") calInvalid("calendar " + name + " is a boolean.");
    settings.now = input.nowIndicator !== false;
    settings.eventLimit = input.eventLimit === undefined || input.eventLimit === "auto" ? "auto" : integer("eventLimit", 1, 20, 3);
    settings.eventStyle = input.eventStyle === undefined ? "quiet" : input.eventStyle;
    if (!["quiet", "strong"].includes(settings.eventStyle)) calInvalid("calendar eventStyle is quiet or strong.");
    settings.zoneName = input.timeZone === undefined ? grid.local ? "local" : "utc" : input.timeZone;
    if (typeof settings.zoneName !== "string" || !calZone(settings.zoneName)) calInvalid("calendar timeZone is utc, local or a time zone the browser knows.");
    settings.zoneFixed = input.timeZone !== undefined;
    settings.limit = integer("limit", 1, 100000, 20000);
    settings.phone = input.phone === undefined ? null : input.phone;
    if (settings.phone !== null && !views.includes(settings.phone)) calInvalid("calendar phone names one of the calendar's views.");
    settings.editable = calEditable(input.editable, columns, settings);
    settings.zooms = input.zooms === undefined ? CAL_ZOOMS.slice() : input.zooms;
    if (!Array.isArray(settings.zooms) || !settings.zooms.length || new Set(settings.zooms).size !== settings.zooms.length || settings.zooms.some(zoom => !CAL_ZOOMS.includes(zoom)))
      calInvalid("calendar zooms list unique zoom levels.");
    settings.zoom = input.zoom === undefined ? settings.zooms.includes("day") ? "day" : settings.zooms[0] : input.zoom;
    if (!settings.zooms.includes(settings.zoom)) calInvalid("calendar zoom must be one of its zooms.");
    settings.resources = calResources(input.resources);
    settings.capacity = calCapacity(input.capacity);
    settings.ranges = calRanges(input.ranges);
    settings.availability = calAvailability(input.availability);
    return settings;
  }

  function calEditable(value, columns, settings) {
    if (value === undefined || value === false) return null;
    const input = value === true ? {} : value;
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).some(key => !["move", "resize", "resources", "overlap", "workingHours", "allowedResources", "snapMinutes", "commit"].includes(key)))
      calInvalid("calendar editable takes move, resize, resources, overlap, workingHours, allowedResources, snapMinutes and commit.");
    for (const name of ["move", "resize", "resources", "overlap", "workingHours"]) if (input[name] !== undefined && typeof input[name] !== "boolean") calInvalid("calendar editable " + name + " is a boolean.");
    const allowed = input.allowedResources === undefined ? null : columns.get(input.allowedResources);
    if (input.allowedResources !== undefined && (!allowed || allowed.kind !== "text")) calInvalid("calendar editable allowedResources names a text column.");
    const snap = input.snapMinutes === undefined ? settings.slotMinutes : input.snapMinutes;
    if (![1, 5, 10, 15, 20, 30, 60].includes(snap)) calInvalid("calendar editable snapMinutes is 1, 5, 10, 15, 20, 30 or 60.");
    if (input.commit !== undefined && !["auto", "manual"].includes(input.commit)) calInvalid("calendar editable commit is auto or manual.");
    return { move: input.move !== false, resize: input.resize !== false && !!settings.end, resources: input.resources !== false && !!settings.resource,
      overlap: input.overlap !== false, working: !!input.workingHours, allowed, snap, commit: input.commit || "auto" };
  }

  function calResources(value) {
    if (value === undefined) return null;
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !["view", "width", "label", "aggregates"].includes(key)) ||
        !value.view || value.view.type !== "view") calInvalid("calendar resources hold a tree view and optional width, label and aggregates.");
    if (value.width !== undefined && (!Number.isInteger(value.width) || value.width < 120 || value.width > 800)) calInvalid("calendar resources width is 120 to 800 pixels.");
    if (value.label !== undefined && (typeof value.label !== "string" || !value.label.trim() || value.label.length > 256)) calInvalid("calendar resources label is text.");
    const aggregates = value.aggregates || {};
    if (typeof aggregates !== "object" || Array.isArray(aggregates) || Object.entries(aggregates).some(([id, kind]) =>
        !(value.view.columns || []).some(column => column.id === id) || !["count", "busy", "overlap"].includes(kind))) calInvalid("calendar resource aggregates map tree columns to count, busy or overlap.");
    return { view: value.view, width: value.width || 280, label: value.label || null, aggregates };
  }

  function calCapacity(value) {
    if (value === undefined) return null;
    const thresholds = value && value.thresholds;
    if (!value || typeof value !== "object" || Object.keys(value).some(key => !["thresholds", "label"].includes(key)) || !Array.isArray(thresholds) || thresholds.length > 8 ||
        thresholds.some((item, index) => !item || !Number.isInteger(item.at) || item.at < 1 || !CAL_TONE.test(item.tone || "") || index && thresholds[index - 1].at >= item.at) ||
        value.label !== undefined && (typeof value.label !== "string" || !value.label.trim()))
      calInvalid("calendar capacity takes rising thresholds { at, tone } and a label.");
    return { thresholds, label: value.label || null };
  }

  function calRanges(list) {
    if (list === undefined) return [];
    if (!Array.isArray(list) || list.length > 1000) calInvalid("calendar ranges are a list of at most 1000.");
    return list.map(item => {
      const start = calInstant(item?.start), end = calInstant(item?.end);
      if (!item || typeof item !== "object" || Object.keys(item).some(key => !["start", "end", "label", "tone", "resource", "kind", "recurrence"].includes(key)) ||
          !(start < end) || typeof item.label !== "string" || !item.label.trim() || item.label.length > 256 || item.tone !== undefined && !CAL_TONE.test(item.tone) ||
          item.resource !== undefined && typeof item.resource !== "string" || item.kind !== undefined && !["background", "unavailable"].includes(item.kind))
        calInvalid("a calendar range has start before end, a label, and optional tone, resource, kind and recurrence.");
      if (item.recurrence !== undefined) calRule(item.recurrence);
      return { start, end, label: item.label, tone: calSafeTone(item.tone) || (item.kind === "unavailable" ? "neutral" : "info"), resource: item.resource ?? null, kind: item.kind || "background", recurrence: item.recurrence || null };
    });
  }

  function calAvailability(list) {
    if (list === undefined) return [];
    if (!Array.isArray(list) || list.length > 10000) calInvalid("calendar availability is a list of at most 10000.");
    return list.map(item => {
      if (!item || typeof item !== "object" || Object.keys(item).some(key => !["resource", "days", "start", "end"].includes(key)) || item.resource !== undefined && typeof item.resource !== "string")
        calInvalid("calendar availability entries take resource, days, start and end.");
      return { resource: item.resource ?? null, days: calDays(item.days === undefined ? [1, 2, 3, 4, 5] : item.days, "calendar availability days"), ...calTimeRange(item, "calendar availability") };
    });
  }
