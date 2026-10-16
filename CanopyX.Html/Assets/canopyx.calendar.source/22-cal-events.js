  // ---------- calendar: events from records, and the occurrences of a range ----------
  // A record becomes an event once: its start and end instants, all-day flag, title, subtitle, status tone, resource, parsed
  // recurrence and exceptions are read from the columns the settings name and kept per record object, so painting a range
  // again reads nothing twice. An occurrence is what a view draws: one per plain event, one per expanded instance of a series.
  // All-day events are dates: the yyyy-MM-dd their start and end values are written with, the end exclusive at midnight (an
  // iCalendar DTEND), so a password that expires on 2026-10-16 shows on the 16th in every zone. A missing end, or an end before
  // the start, makes a zero-length marker; an all-day event without an end lasts its start day. A series expands in the
  // calendar's fixed series zone (its IANA timeZone, else UTC), never in the zone a reader happens to display.
  const CAL_BASES = new WeakMap(), CAL_UTC = () => calZone("utc"), CAL_TONE_NAME = /^[a-z][a-z0-9-]{0,31}$/;
  /** The recurrence part's functions (calRule, calExpand, calSeriesEnd, calExceptions) once it is in; it loads before records are read. */
  const calRec = () => DataGrid.prototype.calKit.calRule ? DataGrid.prototype.calKit : null;
  /** A tone name the theme can resolve, or null: never text that would reach a CSS value unchecked. */
  function calSafeTone(tone) { return typeof tone === "string" && CAL_TONE_NAME.test(tone) && !tone.endsWith("-bg") ? tone : null; }
  /** The day an all-day value names: the date it is written with, whatever offset follows. */
  function calDateOf(value) { return typeof value === "string" ? calParseDay(value.slice(0, 10)) : NaN; }

  /** The event a record holds, or null when its start is missing or invalid. */
  function calBase(view, row) {
    const cached = CAL_BASES.get(row);
    if (cached && cached.view === view && cached.version === view.calVersion) return cached.base;
    // An event of an iCalendar source carries its values by name (row.fields) and no cells; a record carries them in the columns.
    const cal = view.cal, cells = row.cells, fields = row.external ? row.fields : null;
    const read = column => column && !fields ? cellValue(cells[column.id]) : null, value = name => fields ? fields[name] ?? null : read(cal[name]);
    let base = null;
    const start = calInstant(value("start"));
    if (Number.isFinite(start)) {
      const allDay = value("allDay") === true || value("allDay") === "true";
      let end = calInstant(value("end"));
      if (allDay) {
        const first = calDateOf(value("start")), endText = value("end"), last = calDateOf(endText);
        // An end at midnight is exclusive; an end during a day includes that day.
        const endDay = Number.isFinite(end) && Number.isFinite(last) ? (/T00:00(?::00(?:\.0+)?)?(?:Z|[+-]|$)/.test(endText) ? last : last + 1) : NaN;
        base = { start: first * CAL_DAY, end: (endDay > first ? endDay : first + 1) * CAL_DAY };
      } else base = { start, end: Number.isFinite(end) && end >= start ? end : start };
      const ownTone = cal.tone && !fields ? calSafeTone(String(read(cal.tone) ?? "").trim()) : null;
      Object.assign(base, { key: row.id, row, allDay, marker: !allDay && base.end === base.start,
        title: (fields ? fields.title : cellText(cells[cal.title.id], cal.title, view.fmt)) || row.id, subtitle: cal.subtitle && !fields ? cellText(cells[cal.subtitle.id], cal.subtitle, view.fmt) : "",
        // The tone column wins, then the status tone, then the tone of the record's source.
        tone: ownTone || (fields ? null : calTone(cal.status, cells)) || calSourceTone(cal, fields ? row.external : read(cal.source)),
        source: fields ? row.external : cal.source ? calResourceOf(read(cal.source)) : null, external: !!fields, toneFromStatus: !ownTone && !fields,
        resource: cal.resource ? calResourceOf(read(cal.resource)) : null,
        background: cal.display ? String(read(cal.display) || "").toLowerCase() === "background" : false, rule: null, ruleError: null,
        series: fields ? fields.series || null : cal.series ? read(cal.series) || null : null, recurrenceId: calInstant(fields ? fields.recurrenceId : read(cal.recurrenceId)) });
      const text = value("recurrence");
      if (typeof text === "string" && text.trim() && !base.series) {
        try { const rec = calRec(); if (!rec) throw new Error("CanopyX: the calendar recurrence part is not loaded."); base.rule = rec.calRule(text); Object.assign(base, rec.calExceptions(value("exceptions"), allDay ? CAL_UTC() : view.calSeriesZone)); }
        catch (error) { base.ruleError = error; }
      }
    }
    CAL_BASES.set(row, { view, version: view.calVersion, base });
    return base;
  }
  /** The tone of a source the record names, when the calendar lists sources. */
  function calSourceTone(cal, id) { return id != null && cal.sources?.length ? cal.sources.find(source => source.id === String(id).trim())?.tone ?? null : null; }
  /** A resource cell's id: text, trimmed; empty means none. */
  function calResourceOf(value) { return typeof value === "string" && value.trim() ? value.trim() : null; }
  /** The tone of the status column's cell: its presenter's tone for the value, else the cell's own tone. */
  function calTone(column, cells) {
    if (!column) return null;
    const cell = cells[column.id], raw = cellValue(cell), own = isCellObject(cell) && typeof cell.tone === "string" ? cell.tone : null;
    if (raw == null) return calSafeTone(own);
    return calSafeTone(column.presenter ? gridPresenterTone(column.presenter, raw, own) : own);
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
      const starts = calRec().calExpand(base.rule, base.start, duration, base.allDay ? CAL_UTC() : zone, from - (base.allDay ? CAL_DAY : 0), to + (base.allDay ? CAL_DAY : 0), excluded, base.excludedDays, limit);
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
    const out = [], inverse = new Map();
    view.cal.ranges.forEach((range, index) => {
      // An inverse range expands over the whole window (a daily rule over a quarter), or its gaps would read as unavailable.
      const starts = range.recurrence ? calRec().calExpand(calRec().calRule(range.recurrence), range.start, range.end - range.start, view.calSeriesZone, from, to, new Set(), new Set(), range.inverse ? 20000 : 1000) :
        calOverlaps(range.start, range.end, from, to) ? [range.start] : [];
      // A group with nothing in the window still shades all of it.
      if (range.inverse && !inverse.has(range.resource ?? "")) inverse.set(range.resource ?? "", { range, index, spans: [] });
      for (const start of starts) {
        const end = start + range.end - range.start;
        if (range.inverse) {
          inverse.get(range.resource ?? "").spans.push([Math.max(start, from), Math.min(end, to)]);
          continue;
        }
        out.push({ id: "range-" + index + "-" + start, start, end, sd: view.calZone.day(start), ed: view.calZone.day(end - 1), label: range.label, tone: range.tone,
          resource: range.resource, kind: range.kind });
      }
    });
    // Inverse ranges shade the time outside them: outside the union of a resource's (or the global) inverse ranges, within the
    // loaded window. The first inverse range of each group gives the shade its label, tone and kind.
    for (const { range, index, spans } of inverse.values()) {
      const add = (start, end) => { if (end > start) out.push({ id: "range-" + index + "-out-" + start, start, end, sd: view.calZone.day(start), ed: view.calZone.day(end - 1), label: range.label, tone: range.tone, resource: range.resource, kind: range.kind, inverse: true }); };
      let at = from;
      for (const [start, end] of spans.sort((a, b) => a[0] - b[0])) { add(at, start); at = Math.max(at, end); }
      add(at, to);
    }
    return out;
  }
