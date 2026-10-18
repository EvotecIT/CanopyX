  // ---------- calendar: iCalendar import (RFC 5545, docs/icalendar.md) ----------
  // A source with ics names a same-origin iCalendar file; its events join the calendar read-only, under the source's id. The
  // text is untrusted and is read as the .NET CanopyICalendar reads it: within fixed limits (any limit fails the whole import,
  // with a message that names it and never repeats the text), every value stays text, control characters are dropped, and a
  // malformed event is skipped and counted. VCALENDAR > VEVENT is read (UID, SUMMARY, DESCRIPTION, LOCATION, DTSTART, DTEND,
  // DURATION, RRULE, EXDATE, RECURRENCE-ID, STATUS, CATEGORIES); other components are skipped. A TZID that names an IANA zone
  // is honoured; any other, and a time without a zone, is read as UTC with a note. A rule outside the calendar's recurrence
  // subset makes the event a single one, with a note.
  const CAL_ICS_LIMITS = Object.freeze({ text: 2000000, bytes: 8000000, events: 5000, lines: 75000, line: 10000, short: 1000, description: 10000, exdates: 1000, depth: 16, zones: 100, notes: 100, series: 1000, count: 1000 });
  // C0 and C1 controls and DEL, as .NET's char.IsControl; tab and line feed stay.
  const CAL_ICS_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, CAL_ICS_DATE = /^(\d{4})(\d\d)(\d\d)$/, CAL_ICS_TIME = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(Z?)$/;
  const CAL_ICS_DURATION = /^([+-])?P(?:(\d{1,5})W)?(?:(\d{1,5})D)?(?:T(?:(\d{1,5})H)?(?:(\d{1,6})M)?(?:(\d{1,7})S)?)?$/, CAL_ICS_ZONE = /^(?!.*\.\.)[A-Za-z0-9 /_+\-.()]{1,64}$/;
  const calIcsLimit = what => new Error("more than " + what);
  // Imported series keep their own recurrence zone without adding fields to the parser's result or the public event model.
  const CAL_ICS_SERIES_ZONES = new WeakMap();

  /** A text value: escapes undone, control characters other than tab and line feed dropped, unpaired surrogates replaced. */
  function calIcsUnescape(value) {
    const text = value.replace(/\\([nN\\;,])/g, (all, char) => char === "n" || char === "N" ? "\n" : char).replace(CAL_ICS_CONTROL, char => char === "\t" || char === "\n" ? char : "");
    return typeof text.toWellFormed === "function" ? text.toWellFormed() : text.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\ufffd");
  }
  /** One content line: its name, parameters and value, or null when it is malformed. Parameter values may be quoted. */
  function calIcsLine(line) {
    const name = /^[A-Za-z0-9-]+/.exec(line)?.[0];
    if (!name) return null;
    let at = name.length;
    const params = Object.create(null);
    while (line[at] === ";") {
      const key = /^[A-Za-z0-9-]+/.exec(line.slice(at + 1))?.[0];
      if (!key || line[at + 1 + key.length] !== "=") return null;
      at += key.length + 2;
      const values = [];
      for (;;) {
        if (line[at] === "\"") { const close = line.indexOf("\"", at + 1); if (close < 0) return null; values.push(line.slice(at + 1, close)); at = close + 1; }
        else { const match = /^[^";:,]*/.exec(line.slice(at))[0]; values.push(match); at += match.length; }
        if (line[at] !== ",") break;
        at++;
      }
      params[key.toUpperCase()] = values;
    }
    if (line[at] !== ":") return null;
    return { name: name.toUpperCase(), params, value: line.slice(at + 1) };
  }
  /** Whether a name is an IANA zone this browser knows. */
  function calIcsZoneKnown(name) {
    try { new Intl.DateTimeFormat("en", { timeZone: name }); return true; } catch { return false; }
  }

  /**
   * Reads iCalendar text. Returns { events, skipped, notes } where each event is { uid, title, description, location,
   * categories, status, start, end, allDay, recurrence, unsupported, cut, exceptions, recurrenceId } with text values (ISO
   * instants; all-day events at UTC midnights of their dates, the end exclusive). Throws when the text breaks a limit or holds no VCALENDAR.
   */
  function calIcsParse(text) {
    const limits = CAL_ICS_LIMITS;
    if (typeof text !== "string") throw new Error("not text");
    if (text.length > limits.text) throw calIcsLimit(limits.text + " characters");
    // Unfolding: a line that starts with a space or a tab continues the one before it; empty lines are skipped.
    const lines = [];
    for (const line of text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)) {
      if ((line[0] === " " || line[0] === "\t") && lines.length) lines[lines.length - 1] += line.slice(1);
      else if (line) { lines.push(line); if (lines.length > limits.lines) throw calIcsLimit(limits.lines + " lines"); }
      if (lines.length && lines[lines.length - 1].length > limits.line) throw new Error("a line longer than " + limits.line + " characters");
    }
    const notes = [], events = [], zones = new Map(), note = (index, text) => { if (notes.length < limits.notes) notes.push("Event " + index + ": " + text); };
    let index = 0;
    const zoneOf = tzid => {
      // A single leading slash marks a globally scoped TZID; lookup uses its zone name, as the .NET reader does.
      tzid = tzid.trim().replace(/^\//, "");
      if (!zones.has(tzid)) {
        const known = zones.size < limits.zones && CAL_ICS_ZONE.test(tzid) && calIcsZoneKnown(tzid);
        zones.set(tzid, known ? calZone(tzid) : null);
      }
      return zones.get(tzid);
    };
    // A date or date-time property: { day } for a date, { time, zone, day, wall } for an instant.
    const when = (property, value = property.value) => {
      const date = CAL_ICS_DATE.exec(value);
      if (date || property.params.VALUE?.[0]?.toUpperCase() === "DATE") {
        // Years before 1000 are not read (the browser's date arithmetic would shift years below 100).
        if (!date || +date[1] < 1000) return null;
        const day = calParseDay(date[1] + "-" + date[2] + "-" + date[3]);
        return Number.isFinite(day) ? { day } : null;
      }
      const match = CAL_ICS_TIME.exec(value);
      if (!match || +match[1] < 1000) return null;
      const day = calParseDay(match[1] + "-" + match[2] + "-" + match[3]), hours = +match[4], minutes = +match[5], seconds = Math.min(+match[6], 59);
      if (!Number.isFinite(day) || hours > 23 || minutes > 59 || +match[6] > 60) return null;
      const wall = hours * 60 + minutes, tzid = match[7] ? null : property.params.TZID?.[0];
      let zone = match[7] ? null : tzid ? zoneOf(tzid) : null;
      if (!match[7] && !zone) { note(index, tzid ? "its time zone is unknown here, read as UTC" : "a time without a zone, read as UTC"); zone = null; }
      const time = zone ? zone.instant(day, wall) + seconds * 1000 : day * CAL_DAY + wall * CAL_MINUTE + seconds * 1000;
      return { time, zone, day, wall, seconds };
    };
    let depth = 0, inCalendar = false, sawCalendar = false, current = null, nested = 0, skipped = 0;
    const series = { count: 0 };
    for (const line of lines) {
      const property = calIcsLine(line);
      if (!property) { if (current) current.bad = true; continue; }
      const { name, value } = property;
      if (name === "BEGIN") {
        const what = value.trim().toUpperCase();
        if (++depth > limits.depth) throw calIcsLimit(limits.depth + " nested components");
        if (what === "VCALENDAR" && depth === 1) { inCalendar = true; sawCalendar = true; }
        else if (what === "VEVENT" && inCalendar && depth === 2 && !current) {
          if (events.length + skipped + 1 > limits.events) throw calIcsLimit(limits.events + " events");
          index++;
          current = { exdates: [], categories: 0, bad: false };
        } else if (current) nested++;
        continue;
      }
      if (name === "END") {
        const what = value.trim().toUpperCase();
        if (current && nested) nested--;
        else if (current && what === "VEVENT" && depth === 2) {
          const event = calIcsEvent(current, when, limits, series);
          if (event) {
            events.push(event);
            if (event.unsupported) note(index, "a repeat rule outside the supported subset, or past " + limits.series + " repeating events, shown once");
            if (event.cut) note(index, "a repeat count over " + limits.count + " ends at the " + limits.count + "th occurrence");
          } else skipped++;
          current = null;
        } else if (what === "VCALENDAR" && depth === 1) inCalendar = false;
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (!current || nested) continue;
      // A property keeps its first value, except EXDATE and CATEGORIES, which add up.
      if (name === "EXDATE") {
        for (const item of value.split(",")) { current.exdates.push({ property, value: item.trim() }); if (current.exdates.length > limits.exdates) throw calIcsLimit(limits.exdates + " exceptions in an event"); }
        continue;
      }
      if (name === "CATEGORIES") {
        current.categories += calIcsUnescape(value).length;
        if (current.categories > limits.short) throw calIcsLimit(limits.short + " characters of CATEGORIES");
        const category = calIcsUnescape(value).trim();
        if (category) (current.categoryList ||= []).push(category);
        continue;
      }
      if (!(name in current)) current[name] = property;
    }
    // An event left open is malformed.
    if (current) skipped++;
    if (!sawCalendar) throw new Error("no VCALENDAR");
    return { events, skipped, notes };
  }

  /**
   * An imported rule the calendar can expand cheaply on every paint: it must repeat within its first thousand periods (a rule
   * that never matches would walk the whole history each time), and a COUNT becomes the UNTIL of its last occurrence (at most
   * the thousandth), so painting a range never walks a series from its start. Throws when the rule is outside the subset.
   */
  function calIcsSeries(text, start, allDay, limits) {
    const rule = calRule(text), zone = allDay || !start.zone ? calZone("utc") : start.zone, at = allDay ? start.day * CAL_DAY : start.time;
    const horizon = { DAILY: 1000, WEEKLY: 7000, MONTHLY: 30500, YEARLY: 146100 }[rule.freq] * rule.interval * CAL_DAY;
    if (rule.count !== 1 && calExpand(rule, at, 0, zone, at, at + horizon, new Set(), new Set(), 2).length < 2) throw new Error("no second occurrence");
    if (rule.count === null) return { recurrence: text, cut: false };
    const all = calExpand(rule, at, 0, zone, -Infinity, Infinity, new Set(), new Set(), Math.min(rule.count, limits.count)), last = all[all.length - 1];
    const parts = text.replace(/^RRULE:/i, "").split(";").filter(part => part && !/^(COUNT|UNTIL)=/i.test(part.trim()));
    const until = allDay ? calDayText(Math.floor(last / CAL_DAY)).replace(/-/g, "") : new Date(last).toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
    return { recurrence: [...parts, "UNTIL=" + until].join(";"), cut: rule.count > limits.count };
  }

  /** One VEVENT's values, or null when it is malformed (no start, a bad date). A value past its limit fails the import. */
  function calIcsEvent(item, when, limits, series) {
    const text = (name, limit) => {
      if (!item[name]) return "";
      const value = calIcsUnescape(item[name].value).trim();
      if (value.length > limit) throw calIcsLimit(limit + " characters of " + name);
      return value;
    };
    const title = text("SUMMARY", limits.short), description = text("DESCRIPTION", limits.description), location = text("LOCATION", limits.short);
    // An identity or status past its length is dropped, as .NET reads it, rather than failing the import.
    const optional = (name, limit) => { const value = item[name] ? calIcsUnescape(item[name].value).trim() : ""; return value.length <= limit ? value : ""; };
    const uid = optional("UID", limits.short), status = optional("STATUS", 64).toUpperCase();
    if (item.bad || !item.DTSTART) return null;
    const start = when(item.DTSTART);
    if (!start) return null;
    const allDay = start.day !== undefined && start.time === undefined;
    let end = item.DTEND ? when(item.DTEND) : null;
    if (item.DTEND && !end) return null;
    if (!end && item.DURATION) {
      const match = CAL_ICS_DURATION.exec(item.DURATION.value.trim());
      if (!match) return null;
      const days = +(match[2] || 0) * 7 + +(match[3] || 0), exact = (+(match[4] || 0) * 60 + +(match[5] || 0)) * CAL_MINUTE + +(match[6] || 0) * 1000;
      if (match[1] === "-") end = null;
      // Weeks and days keep the wall time in the start's zone; hours, minutes and seconds are exact.
      else if (allDay) end = { day: start.day + days + (exact > 0 ? Math.ceil(exact / CAL_DAY) : 0) };
      else end = { time: (start.zone ? start.zone.instant(start.day + days, start.wall) + start.seconds * 1000 : start.time + days * CAL_DAY) + exact };
    }
    // An all-day end is a date (a time rounds up to the next midnight); an end at or before the start is ignored.
    let endText = null;
    if (allDay && end) { const day = end.time === undefined ? end.day : Math.ceil(end.time / CAL_DAY); if (day > start.day) endText = calDayText(day) + "T00:00:00Z"; }
    else if (!allDay && end) { const time = end.time ?? end.day * CAL_DAY; if (time > start.time) endText = calIso(time); }
    const exceptions = [];
    for (const { property, value } of item.exdates) {
      if (!value) continue;
      const at = when(property, value);
      if (!at) return null;
      exceptions.push(at.time === undefined ? calDayText(at.day) : calIso(at.time));
    }
    let recurrence = null, unsupported = false, cut = false;
    if (item.RRULE && series.count >= limits.series) unsupported = true;
    else if (item.RRULE) {
      try { ({ recurrence, cut } = calIcsSeries(item.RRULE.value.trim(), start, allDay, limits)); series.count++; } catch { unsupported = true; }
    }
    const recurrenceId = item["RECURRENCE-ID"] ? when(item["RECURRENCE-ID"]) : null;
    if (item["RECURRENCE-ID"] && !recurrenceId) return null;
    const event = {
      uid, title, description, location, categories: (item.categoryList || []).join(","), status,
      // All-day values are dates written as UTC midnights, as the calendar reads all-day records.
      start: allDay ? calDayText(start.day) + "T00:00:00Z" : calIso(start.time), end: endText,
      allDay, recurrence, unsupported, cut, exceptions: exceptions.join(","),
      recurrenceId: recurrenceId ? (recurrenceId.time === undefined ? calDayText(recurrenceId.day) + "T00:00:00Z" : calIso(recurrenceId.time)) : null
    };
    if (recurrence && !allDay) CAL_ICS_SERIES_ZONES.set(event, start.zone?.name || "utc");
    return event;
  }
  Object.assign(DataGrid.prototype, {
    /** Loads every iCalendar source once: its events become read-only rows of the calendar; a failure becomes a notice. */
    async calLoadIcs() {
      const rows = [], errors = [], signal = this.lifetime.signal;
      await Promise.all(this.cal.sources.filter(source => source.ics).map(async source => {
        try {
          const text = await calIcsFetch(source.ics, signal), result = calIcsParse(text);
          rows.push(...calIcsRows(source.id, result.events));
          this.emit("calendarImport", { source: source.id, events: result.events.length, skipped: result.skipped, notes: result.notes });
        } catch (error) {
          if (error.name === "AbortError") return;
          errors.push(fill(this.calLabels.calendarImportFailed, { source: source.label, error: String(error.message || error).slice(0, 200) }));
          this.emit("error", { error, source: source.id });
        }
      }));
      this.calIcsRows = rows; this.calIcsErrors = errors;
    }
  });

  /** Fetches a same-origin iCalendar file within the byte limit. */
  async function calIcsFetch(address, signal) {
    const url = new URL(address, location.href);
    // A page without a web origin (a file, a sandboxed frame) has no site to read from: every opaque origin would match.
    if (location.origin === "null" || url.origin !== location.origin || !/^https?:$/.test(url.protocol)) throw new Error("not on this site");
    const response = await fetch(url, { credentials: "same-origin", signal, headers: { Accept: "text/calendar" } });
    if (!response.ok) throw new Error("HTTP " + response.status);
    if (new URL(response.url || url.href).origin !== location.origin) throw new Error("not on this site");
    const length = Number(response.headers.get("content-length"));
    if (length > CAL_ICS_LIMITS.bytes) throw new Error("the file is too large");
    if (!response.body?.getReader) { const text = await response.text(); if (text.length > CAL_ICS_LIMITS.text) throw new Error("the file is too large"); return text; }
    const reader = response.body.getReader(), decoder = new TextDecoder("utf-8");
    let text = "", bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > CAL_ICS_LIMITS.bytes) { reader.cancel().catch(() => {}); throw new Error("the file is too large"); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  }

  /** Rows for the events of a source: ids from their UID (an overriding event adds its RECURRENCE-ID), values by name. */
  function calIcsRows(source, events) {
    const rows = [], used = new Map(), emitted = new Set(), byUid = new Map(), cancelled = [];
    events.forEach((event, index) => {
      const series = "ics:" + source + ":" + (event.uid || "e" + (index + 1));
      if (event.recurrenceId) {
        if (event.status === "CANCELLED") { cancelled.push([series, event.recurrenceId]); return; }
      } else if (event.status === "CANCELLED") return;
      // A repeated identity gets a number: one lookup per event, whatever the file repeats.
      const base = event.recurrenceId ? series + "@" + event.recurrenceId : series;
      let seen = used.get(base) || 0, id = seen ? base + "+" + seen : base;
      while (emitted.has(id)) id = base + "+" + ++seen;
      used.set(base, seen + 1); emitted.add(id);
      const row = { id, cells: Object.create(null), external: source, fields: {
        title: event.title, start: event.start, end: event.end, allDay: event.allDay, recurrence: event.recurrenceId ? null : event.recurrence, exceptions: event.exceptions,
        series: event.recurrenceId ? series : null, recurrenceId: event.recurrenceId, description: event.description, location: event.location,
        seriesZone: CAL_ICS_SERIES_ZONES.get(event) } };
      if (!event.recurrenceId && !byUid.has(series)) byUid.set(series, row);
      rows.push(row);
    });
    // A cancelled occurrence of a series is an exception of it (at most 1,000 a series, as for EXDATE).
    const extra = new Map();
    for (const [series, at] of cancelled) { const list = extra.get(series) || extra.set(series, []).get(series); if (list.length < CAL_ICS_LIMITS.exdates) list.push(at); }
    for (const [series, list] of extra) {
      const row = byUid.get(series);
      if (!row?.fields.recurrence) continue;
      const all = [...(row.fields.exceptions ? row.fields.exceptions.split(",") : []), ...list].slice(0, CAL_ICS_LIMITS.exdates);
      row.fields.exceptions = all.join(",");
    }
    return rows;
  }
