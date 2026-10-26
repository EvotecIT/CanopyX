  // ---------- calendar: the opt-in settings (docs/calendar.md#levels-and-options) ----------
  // The grid toolbar's controls, the details popover, event descriptions, tones and sources, creating and dropping events, how
  // an occurrence of a series changes, week numbers, day links, the valid range, the month's six weeks and outside days, the
  // timeline's span, context menus, hover cards, the year's event lists, the agenda's period, the stacked months and printing.
  const CAL_TOOLBAR = ["search", "filters", "columns", "views", "export", "more"], CAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

  function calSettingsMore(input, column, settings) {
    const flag = (name, fallback) => {
      if (input[name] === undefined) return fallback;
      if (typeof input[name] !== "boolean") calInvalid("calendar " + name + " is a boolean.");
      return input[name];
    };
    const choice = (name, values, fallback) => {
      if (input[name] === undefined) return fallback;
      if (!values.includes(input[name])) calInvalid("calendar " + name + " is " + values.join(", ") + ".");
      return input[name];
    };
    const toolbar = input.toolbar;
    if (toolbar !== undefined && typeof toolbar !== "boolean" && !(Array.isArray(toolbar) && new Set(toolbar).size === toolbar.length && toolbar.every(item => CAL_TOOLBAR.includes(item))))
      calInvalid("calendar toolbar is true, false or a list of " + CAL_TOOLBAR.join(", ") + ".");
    settings.toolbar = toolbar === undefined || toolbar === true ? true : toolbar === false ? false : new Set(toolbar);
    settings.details = choice("details", ["drawer", "popover"], "drawer");
    settings.description = column("description", ["text"]); settings.tone = column("tone", ["text"]); settings.source = column("source", ["text"]);
    settings.sources = calSources(input.sources, settings.source);
    settings.create = calCreate(input.create, settings);
    settings.drop = flag("drop", false);
    if ((settings.create || settings.drop) && (!settings.start.editable || !settings.title?.editable)) calInvalid("calendar create and drop need editable start and title columns.");
    // Changing one occurrence writes new records with the series link: the columns must be editable for the record to keep it.
    const overrides = !!(settings.series?.editable && settings.recurrenceId?.editable);
    settings.occurrence = choice("occurrence", ["ask", "this", "following", "all"], overrides ? "ask" : "all");
    if (!overrides && settings.occurrence !== "all") calInvalid("calendar occurrence " + settings.occurrence + " needs editable series and recurrenceId columns.");
    settings.weekNumbers = input.weekNumbers === undefined || input.weekNumbers === false ? false : choice("weekNumbers", ["iso", "locale"], false);
    settings.navLinks = flag("navLinks", true);
    settings.validRange = calValidRange(input.validRange);
    settings.fixedWeeks = flag("fixedWeeks", false); settings.outsideDays = flag("outsideDays", true);
    settings.span = calSpan(input.span);
    settings.menu = flag("menu", true); settings.hover = flag("hover", true); settings.yearEvents = flag("yearEvents", false); settings.print = flag("print", false);
    settings.agendaSpan = choice("agendaSpan", ["day", "week", "month", "year"], "month");
    if (input.months !== undefined && (!Number.isInteger(input.months) || input.months < 2 || input.months > 24)) calInvalid("calendar months is an integer from 2 to 24.");
    settings.months = input.months ?? 6;
  }

  function calSources(list, sourceColumn) {
    if (list === undefined) return [];
    if (!Array.isArray(list) || !list.length || list.length > 50) calInvalid("calendar sources are a list of 1 to 50.");
    const ids = new Set();
    return list.map(item => {
      if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some(key => !["id", "label", "tone", "ics", "url", "fetchParams", "color", "hidden"].includes(key)) ||
          typeof item.id !== "string" || !CAL_ID.test(item.id) || ids.has(item.id) || typeof item.label !== "string" || !item.label.trim() || item.label.length > 256 ||
          item.tone !== undefined && !CAL_TONE.test(item.tone) || item.url !== undefined && (!calSameOrigin(item.url) || item.ics !== undefined) ||
          item.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(item.color) || !calFetchParams(item.fetchParams, item.url) || item.ics !== undefined && !calSameOrigin(item.ics) || item.hidden !== undefined && typeof item.hidden !== "boolean")
        calInvalid("a calendar source has a unique id, a label, and optional tone, ics (a same-origin address) and hidden.");
      if (item.ics === undefined && item.url === undefined && !sourceColumn) calInvalid("calendar sources without ics need the source column.");
      ids.add(item.id);
      return { id: item.id, label: item.label, tone: calSafeTone(item.tone), ics: item.ics ?? null, url: item.url ?? null, fetchParams: item.fetchParams || {}, color: item.color ?? null, hidden: item.hidden === true };
    });
  }
  function calFetchParams(value, url) {
    if (value === undefined) return true;
    return !!url && value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length <= 50 &&
      Object.entries(value).every(([key, text]) => key.trim() && key.length <= 128 && !["start", "end", "timeZone"].includes(key) && typeof text === "string" && text.length <= 2048);
  }
  /** A relative address, or an absolute one on the page's own origin: an iCalendar source never reaches another site. */
  function calSameOrigin(value) {
    if (typeof value !== "string" || !value || value.length > 2048 || /[\s\\\x00-\x1f\x7f]/.test(value)) return false;
    try {
      const base = typeof location !== "undefined" ? location.href : "https://localhost/", url = new URL(value, base);
      // A relative address is allowed anywhere (a page from disk reports it cannot load it); an absolute one names this web origin.
      if (!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(value)) return true;
      return (url.protocol === "http:" || url.protocol === "https:") && url.origin !== "null" && url.origin === new URL(base).origin;
    } catch { return false; }
  }
  function calCreate(value, settings) {
    if (value === undefined || value === false) return null;
    const input = value === true ? {} : value;
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["minutes", "allDay"].includes(key)) ||
        input.minutes !== undefined && (!Number.isInteger(input.minutes) || input.minutes < 5 || input.minutes > 1440) || input.allDay !== undefined && typeof input.allDay !== "boolean")
      calInvalid("calendar create is true or { minutes (5 to 1440), allDay }.");
    return { minutes: input.minutes ?? 60, allDay: input.allDay !== false && !!settings.allDay?.editable };
  }
  function calValidRange(value) {
    if (value === undefined) return null;
    const first = value?.start === undefined ? -Infinity : calParseDay(value.start), end = value?.end === undefined ? Infinity : calParseDay(value.end);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !["start", "end"].includes(key)) || Number.isNaN(first) || Number.isNaN(end) || !(first < end))
      calInvalid("calendar validRange has a start before its end (yyyy-MM-dd).");
    return { first, last: end - 1 };
  }
  function calSpan(value) {
    if (value === undefined) return null;
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !["count", "unit"].includes(key)) ||
        !Number.isInteger(value.count) || value.count < 1 || value.count > 366 || !["day", "week", "month"].includes(value.unit))
      calInvalid("calendar span is { count (1 to 366), unit (day, week or month) }.");
    return { count: value.count, unit: value.unit };
  }

  Object.assign(DataGrid.prototype, {
    /** Whether every covered date of a selection or edit is inside the end-exclusive valid range. */
    calAllowsSpan(start, end, allDay) {
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return false;
      const valid = this.cal.validRange;
      if (!valid) return true;
      const last = Math.max(start, end - 1), firstDay = allDay ? Math.floor(start / CAL_DAY) : this.calZone.day(start);
      const lastDay = allDay ? Math.floor(last / CAL_DAY) : this.calZone.day(last);
      return firstDay >= valid.first && lastDay <= valid.last;
    },
    /** All-day values are dates: only presentation and day selection map them onto the display zone's midnight axis. */
    calDisplaySpan(event) {
      return event.allDay ? { start: this.calZone.start(Math.floor(event.start / CAL_DAY)), end: this.calZone.start(Math.floor(event.end / CAL_DAY)) } : event;
    }
  });
