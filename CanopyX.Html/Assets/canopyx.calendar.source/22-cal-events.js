  // ---------- calendar: events from records, and the occurrences of a range ----------
  // A record becomes an event once: its start and end instants, all-day flag, title, subtitle, status tone, resource, parsed
  // recurrence and exceptions are read from the columns the settings name and kept per record object, so painting a range
  // again reads nothing twice. An occurrence is what a view draws: one per plain event, one per expanded instance of a series.
  // All-day events are dates: the yyyy-MM-dd their start and end values are written with, the end exclusive at midnight (an
  // iCalendar DTEND), so a password that expires on 2026-10-16 shows on the 16th in every zone. A missing end, or an end before
  // the start, makes a zero-length marker; an all-day event without an end lasts its start day. A series expands in the
  // calendar's fixed series zone (its IANA timeZone, else UTC), never in the zone a reader happens to display.
  const CAL_BASES = new WeakMap(), CAL_UTC = () => calZone("utc"), CAL_TONE_NAME = /^[a-z][a-z0-9-]{0,31}$/;
  const CAL_EXCEPTION = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)(?::(\d\d)(\.\d{1,7})?)?(Z|[+-]\d\d:\d\d)?$/;
  /** A tone name the theme can resolve, or null: never text that would reach a CSS value unchecked. */
  function calSafeTone(tone) { return typeof tone === "string" && CAL_TONE_NAME.test(tone) && !tone.endsWith("-bg") ? tone : null; }
  /** The day an all-day value names: the date it is written with, whatever offset follows. */
  function calDateOf(value) { return typeof value === "string" ? calParseDay(value.slice(0, 10)) : NaN; }

  /** The event a record holds, or null when its start is missing or invalid. */
  function calBase(view, row) {
    const cached = CAL_BASES.get(row);
    if (cached && cached.view === view && cached.version === view.calVersion) return cached.base;
    const cal = view.cal, cells = row.cells, read = column => column ? cellValue(cells[column.id]) : null;
    let base = null;
    const start = calInstant(read(cal.start));
    if (Number.isFinite(start)) {
      const allDay = read(cal.allDay) === true || read(cal.allDay) === "true";
      let end = calInstant(read(cal.end));
      if (allDay) {
        const first = calDateOf(read(cal.start)), endText = read(cal.end), last = calDateOf(endText);
        // An end at midnight is exclusive; an end during a day includes that day.
        const endDay = Number.isFinite(end) && Number.isFinite(last) ? (/T00:00(?::00(?:\.0+)?)?(?:Z|[+-]|$)/.test(endText) ? last : last + 1) : NaN;
        base = { start: first * CAL_DAY, end: (endDay > first ? endDay : first + 1) * CAL_DAY };
      } else base = { start, end: Number.isFinite(end) && end >= start ? end : start };
      Object.assign(base, { key: row.id, row, allDay, marker: !allDay && base.end === base.start,
        title: cellText(cells[cal.title.id], cal.title, view.fmt) || row.id, subtitle: cal.subtitle ? cellText(cells[cal.subtitle.id], cal.subtitle, view.fmt) : "",
        tone: calTone(cal.status, cells), resource: cal.resource ? calResourceOf(read(cal.resource)) : null,
        background: cal.display ? String(read(cal.display) || "").toLowerCase() === "background" : false, rule: null, ruleError: null,
        series: cal.series ? read(cal.series) || null : null, recurrenceId: cal.recurrenceId ? calInstant(read(cal.recurrenceId)) : NaN });
      const text = read(cal.recurrence);
      if (typeof text === "string" && text.trim() && !base.series) {
        try { base.rule = calRule(text); Object.assign(base, calExceptions(read(cal.exceptions), allDay ? CAL_UTC() : view.calSeriesZone)); }
        catch (error) { base.ruleError = error; }
      }
    }
    CAL_BASES.set(row, { view, version: view.calVersion, base });
    return base;
  }
  /** A resource cell's id: text, trimmed; empty means none. */
  function calResourceOf(value) { return typeof value === "string" && value.trim() ? value.trim() : null; }
  /** The tone of the status column's cell: its presenter's tone for the value, else the cell's own tone. */
  function calTone(column, cells) {
    if (!column) return null;
    const cell = cells[column.id], raw = cellValue(cell), own = isCellObject(cell) && typeof cell.tone === "string" ? cell.tone : null;
    if (raw == null) return calSafeTone(own);
    return calSafeTone(column.presenter ? gridPresenterTone(column.presenter, raw, own) : own);
  }
  /**
   * EXDATE values, as C# CanopyRecurrence reads them: yyyy-MM-dd dates remove every occurrence on that day; ISO date-times
   * (HH:mm, or with seconds and a fraction) remove the occurrence starting then, read in the series zone when they carry no Z
   * or offset. Separated by commas, semicolons or white space; at most 1000.
   */
  function calExceptions(value, zone) {
    const excluded = new Set(), excludedDays = new Set();
    if (typeof value !== "string") return { excluded, excludedDays };
    const items = value.split(/[\s,;]+/).filter(Boolean);
    if (items.length > 1000) throw new Error("CanopyX: a series takes at most 1000 exceptions.");
    for (const item of items) {
      const day = calParseDay(item), match = CAL_EXCEPTION.exec(item);
      if (Number.isFinite(day)) { excludedDays.add(day); continue; }
      const date = match ? calParseDay(match[1]) : NaN;
      if (!Number.isFinite(date) || +match[2] > 23 || +match[3] > 59 || match[4] !== undefined && +match[4] > 59) throw new Error("CanopyX: invalid recurrence exception.");
      const minutes = +match[2] * 60 + +match[3], seconds = +(match[4] || 0) + +(match[5] || 0);
      excluded.add(match[6] ? Date.parse(match[1] + "T" + match[2] + ":" + match[3] + ":" + String(match[4] || "00") + match[6]) + Math.round(+(match[5] || 0) * 1000) : zone.instant(date, minutes) + Math.round(seconds * 1000));
    }
    return { excluded, excludedDays };
  }

  /** The occurrences of a list of records that overlap [from, to), sorted by start, then the longest first, then id. */
  function calOccurrences(view, rows, from, to) {
    const zone = view.calSeriesZone, out = [], overrides = new Map(), bases = [], limit = view.cal.limit;
    for (const row of rows) {
      const base = calBase(view, row);
      if (!base) continue;
      if (base.series && Number.isFinite(base.recurrenceId)) {
        if (!overrides.has(base.series)) overrides.set(base.series, new Set());
        overrides.get(base.series).add(base.recurrenceId);
      }
      bases.push(base);
    }
    for (const base of bases) {
      if (base.ruleError && !view.calRuleErrors.has(base.key)) { view.calRuleErrors.add(base.key); view.emit("error", { error: base.ruleError, id: base.key }); }
      if (!base.rule) {
        if (calOverlaps(base.start, base.end, from, to)) out.push(calOccurrence(view, base, base.start, false));
        continue;
      }
      const duration = base.end - base.start, moved = overrides.get(base.key), excluded = moved ? new Set([...base.excluded, ...moved]) : base.excluded;
      // Editing reads it (with calOverridden for records outside these rows): a series cannot shift without detaching them.
      base.overridden = !!moved;
      const starts = calExpand(base.rule, base.start, duration, base.allDay ? CAL_UTC() : zone, from - (base.allDay ? CAL_DAY : 0), to + (base.allDay ? CAL_DAY : 0), excluded, base.excludedDays, limit);
      for (const start of starts) if (calOverlaps(start, start + duration, from, to)) out.push(calOccurrence(view, base, start, true));
    }
    out.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (out.length > limit) { out.length = limit; out.truncated = true; }
    return out;
  }
  function calOverlaps(start, end, from, to) { return end > start ? start < to && end > from : start >= from && start < to; }

  /** One drawn occurrence; its id is the record's, or record@start for an instance of a series. */
  function calOccurrence(view, base, start, recurring) {
    const end = start + (base.end - base.start), zone = base.allDay ? CAL_UTC() : view.calZone;
    const sd = zone.day(start), ed = end > start ? zone.day(end - 1) : sd;
    return { id: recurring ? base.key + "@" + calIso(start) : base.key, key: base.key, base, row: base.row, start, end, allDay: base.allDay,
      marker: base.marker, sd, ed, recurring, occurrence: recurring ? start : null, background: base.background, resource: base.resource,
      title: base.title, subtitle: base.subtitle, tone: base.tone };
  }

  /** The static background ranges (holidays, freezes, maintenance) that overlap [from, to), expanded when they recur. */
  function calStaticRanges(view, from, to) {
    const out = [];
    view.cal.ranges.forEach((range, index) => {
      const starts = range.recurrence ? calExpand(calRule(range.recurrence), range.start, range.end - range.start, view.calSeriesZone, from, to, new Set(), new Set(), 1000) :
        calOverlaps(range.start, range.end, from, to) ? [range.start] : [];
      for (const start of starts) {
        const end = start + range.end - range.start;
        out.push({ id: "range-" + index + "-" + start, start, end, sd: view.calZone.day(start), ed: view.calZone.day(end - 1), label: range.label, tone: range.tone,
          resource: range.resource, kind: range.kind });
      }
    });
    return out;
  }
