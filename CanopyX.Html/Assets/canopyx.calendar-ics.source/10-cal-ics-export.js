  // ---------- calendar: iCalendar export (RFC 5545) ----------
  // Each record is one VEVENT: a series keeps its RRULE and EXDATE instead of being expanded, and an overriding record carries
  // RECURRENCE-ID. Timed events are written in UTC; a series is written in its zone's wall time (TZID with a VTIMEZONE built
  // from the zone's offsets) so it keeps its local time across DST in the reader's calendar. All-day events are dates, the end
  // exclusive. Text values are escaped (backslash, semicolon, comma, line breaks) and lines are folded at 75 octets without
  // splitting a character. The Export menu offers "iCalendar (.ics)" on calendar grids with the menu's scopes; the API also
  // exports the records of the visible range.
  const CAL_ENCODER = new TextEncoder();
  const CAL_ICS_ZONE_YEARS = 100;

  function calIcsText(value) {
    return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
  }
  /** Folds one content line: CRLF plus a space before each 75-octet piece after the first, on character boundaries. */
  function calIcsFold(line) {
    const out = [];
    let current = "", size = 0;
    for (const char of line) {
      const bytes = CAL_ENCODER.encode(char).length;
      if (size + bytes > (out.length ? 74 : 75)) { out.push(current); current = ""; size = 0; }
      current += char; size += bytes;
    }
    out.push(current);
    return out.join("\r\n ");
  }
  function calIcsUtc(time) { return new Date(time).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function calIcsDate(day) { return calDayText(day).replace(/-/g, ""); }
  function calIcsWall(zone, time) { const p = zone.parts(time), s = Math.floor((time % CAL_MINUTE + CAL_MINUTE) % CAL_MINUTE / 1000); return calIcsDate(p.day) + "T" + String(p.h).padStart(2, "0") + String(p.mi).padStart(2, "0") + String(s).padStart(2, "0"); }
  function calIcsOffset(ms) { const sign = ms < 0 ? "-" : "+", minutes = Math.abs(ms) / CAL_MINUTE; return sign + String(Math.floor(minutes / 60)).padStart(2, "0") + String(minutes % 60).padStart(2, "0"); }
  /** The IANA name of a zone ("local" asks the browser which zone the reader is in). */
  function calIcsZoneName(zone) { return zone.name === "local" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : zone.name; }

  /** A finite zoned series' final year, certified before its actual transition table is written. */
  function calIcsLastYear(base) {
    const rule = base.rule, zone = base.seriesZone;
    if (rule.count === null && rule.until === null) return Infinity;
    const firstYear = new Date(base.start).getUTCFullYear(), bound = Date.UTC(firstYear + CAL_ICS_ZONE_YEARS, 0, 1), duration = Math.max(0, base.end - base.start);
    let end;
    if (rule.until) end = (rule.until.time ?? (rule.until.minutes === undefined ? zone.instant(rule.until.day + 1, 0) - 1 : zone.instant(rule.until.day, rule.until.minutes))) + duration;
    else {
      const starts = calExpand(rule, base.start, 0, zone, -Infinity, bound, new Set(), new Set(), rule.count);
      if (starts.length !== rule.count) throw new Error("CanopyX: zoned iCalendar recurrence export needs a COUNT or UNTIL ending within 100 calendar years.");
      end = starts[starts.length - 1] + duration;
    }
    if (!Number.isFinite(end) || end > bound) throw new Error("CanopyX: zoned iCalendar recurrence export needs a COUNT or UNTIL ending within 100 calendar years.");
    return new Date(Math.max(base.start, base.end, end - 1)).getUTCFullYear();
  }

  /** Actual transitions across finite series' years; the repeating form retains the unbounded-series path. */
  function calVTimezone(zone, year, lastYear) {
    const repeat = lastYear === Infinity;
    if (!repeat && lastYear - year >= CAL_ICS_ZONE_YEARS) throw new Error("CanopyX: zoned iCalendar recurrence export is limited to 100 calendar years per time zone.");
    const name = calIcsZoneName(zone), start = Date.UTC(year, 0, 1), finish = Date.UTC((repeat ? year : lastYear) + 1, 0, 1), changes = [];
    let previous = zone.offset(start);
    const initial = previous;
    for (let time = start + CAL_DAY; time <= finish; time += CAL_DAY) {
      const offset = zone.offset(time);
      if (offset === previous) continue;
      let low = time - CAL_DAY, high = time;
      while (high - low > CAL_MINUTE) { const mid = low + Math.max(CAL_MINUTE, Math.floor((high - low) / 2 / CAL_MINUTE) * CAL_MINUTE); if (zone.offset(mid) === previous) low = mid; else high = mid; }
      changes.push({ at: high, from: previous, to: offset }); previous = offset;
    }
    const lines = ["BEGIN:VTIMEZONE", "TZID:" + calIcsText(name)];
    if (!repeat || !changes.length) lines.push("BEGIN:STANDARD", "DTSTART:" + (repeat ? "19700101T000000" : calIcsWall(zone, start)),
      "TZOFFSETFROM:" + calIcsOffset(initial), "TZOFFSETTO:" + calIcsOffset(initial), "END:STANDARD");
    for (const change of changes) {
      const local = change.at + change.from, date = new Date(local), dow = date.getUTCDay(), d = date.getUTCDate(), month = date.getUTCMonth() + 1;
      const last = d + 7 > calMonthDays(date.getUTCFullYear(), month), ordinal = last ? -1 : Math.ceil(d / 7), kind = change.to > change.from ? "DAYLIGHT" : "STANDARD";
      lines.push("BEGIN:" + kind, "DTSTART:" + calIcsDate(calDayNumber(date.getUTCFullYear(), month, d)) + "T" + String(date.getUTCHours()).padStart(2, "0") + String(date.getUTCMinutes()).padStart(2, "0") + "00");
      if (repeat) lines.push("RRULE:FREQ=YEARLY;BYMONTH=" + month + ";BYDAY=" + ordinal + CAL_WEEKDAYS[dow]);
      lines.push("TZOFFSETFROM:" + calIcsOffset(change.from), "TZOFFSETTO:" + calIcsOffset(change.to), "END:" + kind);
    }
    lines.push("END:VTIMEZONE");
    return lines;
  }

  /** An RRULE written back from its parsed form; a floating UNTIL becomes UTC, as a zoned DTSTART requires. */
  function calIcsRule(rule, zone, allDay) {
    const parts = ["FREQ=" + rule.freq];
    if (rule.interval !== 1) parts.push("INTERVAL=" + rule.interval);
    if (rule.count !== null) parts.push("COUNT=" + rule.count);
    if (rule.until) parts.push("UNTIL=" + (allDay ? calIcsDate(rule.until.day ?? Math.floor(rule.until.time / CAL_DAY)) :
      calIcsUtc(rule.until.time ?? (rule.until.minutes === undefined ? zone.instant(rule.until.day + 1, 0) - 1000 : zone.instant(rule.until.day, rule.until.minutes)))));
    if (rule.byMonth) parts.push("BYMONTH=" + rule.byMonth.join(","));
    if (rule.byMonthDay) parts.push("BYMONTHDAY=" + rule.byMonthDay.join(","));
    if (rule.byDay) parts.push("BYDAY=" + rule.byDay.map(item => (item.n || "") + CAL_WEEKDAYS[item.dow]).join(","));
    if (rule.bySetPos) parts.push("BYSETPOS=" + rule.bySetPos.join(","));
    if (rule.wkst !== 1) parts.push("WKST=" + CAL_WEEKDAYS[rule.wkst]);
    return parts.join(";");
  }

  /** The iCalendar text of calendar records (row objects with raw cells). */
  function calIcs(view, rows) {
    const stamp = calIcsUtc(Date.now()), zones = new Map(), events = [];
    for (const row of rows) {
      const base = calBase(view, row);
      if (!base) continue;
      const zone = base.seriesZone;
      const lines = ["BEGIN:VEVENT", "UID:" + calIcsText(view.view.id + "-" + row.id + "@canopyx"), "DTSTAMP:" + stamp];
      const zoned = base.rule && !base.allDay && zone.name !== "utc";
      if (zoned) {
        const first = new Date(base.start).getUTCFullYear(), last = calIcsLastYear(base), prior = zones.get(zone.name);
        zones.set(zone.name, { zone, first: Math.min(first, prior?.first ?? first), last: Math.max(last, prior?.last ?? last) });
      }
      const tz = zoned ? ";TZID=" + calIcsText(calIcsZoneName(zone)) : "";
      const time = value => base.allDay ? ";VALUE=DATE:" + calIcsDate(Math.floor(value / CAL_DAY)) : zoned ? tz + ":" + calIcsWall(zone, value) : ":" + calIcsUtc(value);
      lines.push("DTSTART" + time(base.start));
      if (base.end > base.start) lines.push("DTEND" + time(base.end));
      if (base.series && Number.isFinite(base.recurrenceId)) {
        lines.push("UID:" + calIcsText(view.view.id + "-" + base.series + "@canopyx"));
        lines.splice(1, 1);
        lines.push("RECURRENCE-ID" + time(base.recurrenceId));
      }
      lines.push("SUMMARY:" + calIcsText(base.title));
      const description = [base.subtitle, view.calStatusText({ row })].filter(Boolean).join("\n");
      if (description) lines.push("DESCRIPTION:" + calIcsText(description));
      if (base.resource) lines.push("LOCATION:" + calIcsText(view.calResourceName ? view.calResourceName(base.resource) : base.resource));
      if (base.rule) {
        lines.push("RRULE:" + calIcsRule(base.rule, zone, base.allDay));
        // EXDATE has the type of DTSTART: a day excluded from a timed series is the occurrence at the series' time that day.
        const minutes = zone.parts(base.start).minutes + ((base.start % CAL_MINUTE + CAL_MINUTE) % CAL_MINUTE) / CAL_MINUTE;
        for (const day of base.excludedDays) lines.push(base.allDay ? "EXDATE;VALUE=DATE:" + calIcsDate(day) : "EXDATE" + time(zone.instant(day, minutes)));
        for (const value of base.excluded) lines.push("EXDATE" + (base.allDay ? ";VALUE=DATE:" + calIcsDate(Math.floor(value / CAL_DAY)) : time(value)));
      }
      if (base.background) lines.push("TRANSP:TRANSPARENT");
      lines.push("END:VEVENT");
      events.push(lines);
    }
    const all = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CanopyX//Calendar//EN", "CALSCALE:GREGORIAN"];
    if (view.view.label) all.push("X-WR-CALNAME:" + calIcsText(view.view.label));
    for (const item of zones.values()) all.push(...calVTimezone(item.zone, item.first, item.last));
    for (const lines of events) all.push(...lines);
    all.push("END:VCALENDAR");
    return all.map(calIcsFold).join("\r\n") + "\r\n";
  }

  Object.assign(DataGrid.prototype, {
    /** Writes the Export menu's iCalendar file: the records of the menu's scope, from the export capture (calExportFormat). */
    async calIcsWrite(capture, context) {
      const rows = [];
      for await (const record of capture.rows({ signal: context.signal })) {
        const cells = {};
        for (const [id, cell] of Object.entries(record.cells)) cells[id] = cell && typeof cell === "object" && "value" in cell ? cell.value : cell;
        rows.push({ id: record.id, cells });
        context.progress(rows.length);
      }
      this.calVersion++;
      return new Blob([calIcs(this, rows)], { type: "text/calendar;charset=utf-8" });
    },
    /**
     * Exports iCalendar text (exportCalendar): scope "visible" (the default) takes the records of the occurrences shown, "filtered", "selected" and
     * "all" the records of the grid's export scopes. Resolves with { blob, fileName, text }; download: true saves the file.
     */
    async calIcsExport(options = {}) {
      const scope = options.scope || "visible";
      if (!["visible", "filtered", "selected", "all"].includes(scope)) throw new Error("CanopyX: calendar export scopes are visible, filtered, selected and all.");
      let text;
      if (scope === "visible") {
        const answer = this.calAnswer;
        if (!answer || answer.signal.aborted || answer.epoch !== this.calEpoch || answer.query !== this.acceptedQuery || answer.source !== this.source || this.pendingQuery)
          throw new Error("CanopyX: visible iCalendar export needs the current calendar answer; wait for the range to finish loading.");
        const seen = new Set(), rows = [];
        for (const event of this.calEvents) {
          if (!seen.has(event.key)) { seen.add(event.key); rows.push(event.row); }
          // An override of a series' occurrence travels with its series.
          if (event.base.series && !seen.has(event.base.series)) {
            const inline = this.view.source.kind === "inline" && !this.opts.source;
            const series = answer.rows.find(row => row.id === event.base.series) || (inline ? this.calRowsCache?.rows?.find(row => row.id === event.base.series) : null);
            if (!series) throw new Error("CanopyX: visible iCalendar export needs the recurring master in the current calendar answer.");
            seen.add(series.id); rows.push(series);
          }
        }
        text = calIcs(this, rows);
      } else {
        const blob = await this.exportAs("ics", { scope, values: "raw", download: false });
        text = await blob.blob.text();
      }
      const fileName = (options.fileName || this.view.id.replace(/[^A-Za-z0-9_-]/g, "_")) + ".ics", blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
      if (options.download) {
        const link = h("a"); link.href = URL.createObjectURL(blob); link.download = fileName; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 0);
      }
      return { blob, fileName, text };
    }
  });
