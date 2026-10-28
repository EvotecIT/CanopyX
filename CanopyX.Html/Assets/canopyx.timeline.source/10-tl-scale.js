  // ---------- resource timeline: zoom levels, the time axis and its header rows (docs/resource-timeline.md) ----------
  // A zoom level is a unit (an hour, a day, a week, a month or a quarter), a width per unit and a span the arrows step by: a
  // day of hours, a month of days, a quarter of weeks, a year of months, three years of quarters. Units are wall-clock periods
  // of the display zone, so a day is one unit wide even when DST makes it 23 or 25 hours long; an instant maps to the unit it
  // falls in plus its share of that unit. The header has two rows: the larger period over the units (day over hours, month
  // over days or weeks, year over months or quarters).
  const TL_ZOOMS = {
    hour: { width: 56, unit: "hour" }, day: { width: 44, unit: "day" }, week: { width: 92, unit: "week" },
    month: { width: 112, unit: "month" }, quarter: { width: 150, unit: "quarter" }
  };

  /** The span a zoom shows for a date: { firstDay, lastDay } in day numbers. */
  function tlSpan(zoom, date, firstDay) {
    if (zoom === "hour") return { firstDay: date, lastDay: date };
    if (zoom === "day") { const month = calMonthStart(date); return { firstDay: month, lastDay: calAddMonths(month, 1) - 1 }; }
    if (zoom === "week") {
      const parts = calDayParts(date), quarter = calDayNumber(parts.y, Math.floor((parts.m - 1) / 3) * 3 + 1, 1);
      return { firstDay: calWeekStart(quarter, firstDay), lastDay: calWeekStart(calAddMonths(quarter, 3) - 1, firstDay) + 6 };
    }
    const parts = calDayParts(date);
    if (zoom === "month") return { firstDay: calDayNumber(parts.y, 1, 1), lastDay: calDayNumber(parts.y + 1, 1, 1) - 1 };
    return { firstDay: calDayNumber(parts.y, 1, 1), lastDay: calDayNumber(parts.y + 3, 1, 1) - 1 };
  }
  /** A custom span (span: { count, unit }) from a date: days from it, whole weeks or whole months around it. */
  function tlCustomSpan(span, date, firstDay) {
    if (span.unit === "day") return { firstDay: date, lastDay: date + span.count - 1 };
    if (span.unit === "week") { const first = calWeekStart(date, firstDay); return { firstDay: first, lastDay: first + 7 * span.count - 1 }; }
    const month = calMonthStart(date); return { firstDay: month, lastDay: calAddMonths(month, span.count) - 1 };
  }
  function tlCustomStep(span, date, direction) {
    return span.unit === "month" ? calAddMonths(date, span.count * direction) : date + (span.unit === "week" ? 7 : 1) * span.count * direction;
  }
  function tlStep(zoom, date, direction) {
    if (zoom === "hour") return date + direction;
    if (zoom === "day") return calAddMonths(date, direction);
    if (zoom === "week") return calAddMonths(date, 3 * direction);
    return calAddMonths(date, (zoom === "month" ? 12 : 36) * direction);
  }

  /** The units of a span: [{ start, end, first, last, x }] (instants, day numbers and the unit's left edge). */
  function tlUnits(zoom, span, zone, firstDay) {
    const units = [], width = TL_ZOOMS[zoom].width;
    const push = (first, last, start, end) => units.push({ first, last, start, end, x: units.length * width });
    if (zoom === "hour") {
      for (let at = zone.start(span.firstDay), end = zone.start(span.lastDay + 1); at < end; at += CAL_HOUR) { const day = zone.day(at); push(day, day, at, Math.min(at + CAL_HOUR, end)); }
    } else if (zoom === "day") {
      for (let day = span.firstDay; day <= span.lastDay; day++) push(day, day, zone.start(day), zone.start(day + 1));
    } else if (zoom === "week") {
      for (let day = calWeekStart(span.firstDay, firstDay); day <= span.lastDay; day += 7) push(day, day + 6, zone.start(day), zone.start(day + 7));
    } else {
      const months = zoom === "month" ? 1 : 3;
      for (let day = span.firstDay; day <= span.lastDay; day = calAddMonths(day, months)) { const next = calAddMonths(day, months); push(day, next - 1, zone.start(day), zone.start(next)); }
    }
    return units;
  }

  /** The axis of the current timeline: units, width and the mapping between instants and pixels. */
  function tlAxis(zoom, span, zone, firstDay, minWidth = 0) {
    const units = tlUnits(zoom, span, zone, firstDay), width = Math.max(TL_ZOOMS[zoom].width, minWidth / units.length), total = units.length * width;
    units.forEach((unit, index) => { unit.x = index * width; });
    const unitOf = time => {
      let low = 0, high = units.length - 1;
      while (low < high) { const mid = (low + high + 1) >> 1; if (units[mid].start <= time) low = mid; else high = mid - 1; }
      return low;
    };
    return {
      zoom, units, width, total, from: units[0].start, to: units[units.length - 1].end,
      /** The x of an instant, clamped to the axis. */
      x(time) {
        if (time <= this.from) return 0;
        if (time >= this.to) return total;
        const unit = units[unitOf(time)];
        return unit.x + (time - unit.start) / (unit.end - unit.start) * width;
      },
      /** The instant at an x. */
      time(x) {
        const index = Math.max(0, Math.min(units.length - 1, Math.floor(x / width))), unit = units[index];
        return unit.start + Math.max(0, Math.min(1, (x - unit.x) / width)) * (unit.end - unit.start);
      },
      unitOf
    };
  }

  /** The two header rows' cells for an axis: the larger periods over the units, each { x, width, text, label }. */
  function tlHeader(view, axis) {
    const fmt = view.calFmt, upper = [], lower = [], zoom = axis.zoom;
    const group = (key, text, label, unit) => {
      const last = upper[upper.length - 1];
      if (last && last.key === key) last.width += axis.width;
      else upper.push({ key, x: unit.x, width: axis.width, text, label });
    };
    for (const unit of axis.units) {
      let text, label;
      if (zoom === "hour") { const minutes = view.calZone.parts(unit.start).minutes; text = fmt.hour(minutes); label = fmt.longDay(unit.first) + " " + fmt.clock(minutes); group(unit.first, fmt.longDay(unit.first), fmt.longDay(unit.first), unit); }
      else if (zoom === "day") { text = fmt.dayNumber(unit.first); label = fmt.longDay(unit.first); group(calMonthStart(unit.first), fmt.monthTitle(unit.first), fmt.monthTitle(unit.first), unit); }
      else if (zoom === "week") { text = fmt.shortDay(unit.first); label = fmt.dayRange(unit.first, unit.last); group(calMonthStart(unit.first), fmt.monthTitle(unit.first), fmt.monthTitle(unit.first), unit); }
      else if (zoom === "month") { text = fmt.monthShort(unit.first); label = fmt.monthTitle(unit.first); group(calDayParts(unit.first).y, fmt.year(unit.first), fmt.year(unit.first), unit); }
      else { text = fmt.range({ month: "short" }, unit.first, unit.last); label = fmt.monthRange(unit.first, unit.last); group(calDayParts(unit.first).y, fmt.year(unit.first), fmt.year(unit.first), unit); }
      const dow = calDow(unit.first), off = view.cal.working ? !view.cal.working.days.has(dow) : dow === 0 || dow === 6;
      lower.push({ x: unit.x, width: axis.width, text, label, weekend: zoom === "day" && off, unit });
    }
    return { upper, lower };
  }
