  // ---------- activity part: relative times that keep themselves current ----------
  // A relative time reads "in 3 hr." or "27 sec. ago" in the grid's language; the exact time (in the grid's time zone and
  // date format) is its tooltip and follows it in the accessible name. Raw values keep sorting, filters and exports.
  const ACTIVITY_UNITS = [["year", 31536e6], ["month", 2592e6], ["week", 6048e5], ["day", 864e5], ["hour", 36e5], ["minute", 6e4], ["second", 1e3]];
  function activityRelative(grid, time, now) {
    const format = grid.relativeFormat ||= new Intl.RelativeTimeFormat(grid.lang, { numeric: "auto", style: "short" });
    const distance = time - now, [unit, size] = ACTIVITY_UNITS.find(entry => Math.abs(distance) >= entry[1]) || ACTIVITY_UNITS[6];
    return format.format(Math.round(distance / size), unit);
  }
  // The cadence follows the magnitude: seconds within a minute of now, then quarter minutes, minutes and hours.
  const activityDelay = distance => distance < 6e4 ? 1e3 : distance < 36e5 ? 15e3 : distance < 864e5 ? 6e4 : 36e5;
  // One clock per grid repaints only the times still in the document, on the cadence of the nearest one. It stops while the
  // page is hidden (and repaints when it shows again) and is released with the grid.
  function activityClock(grid) {
    if (grid.activityClock) return grid.activityClock;
    const clock = grid.activityClock = { times: new Map(), timer: 0, due: Infinity }, signal = grid.lifetime.signal;
    const tick = () => {
      clearTimeout(clock.timer); clock.timer = 0; clock.due = Infinity;
      if (grid.destroyed || document.hidden) return;
      const now = Date.now();
      for (const [element, time] of clock.times) {
        if (!element.isConnected) clock.times.delete(element);
        else { setText(element, activityRelative(grid, time, now)); clock.wake(time, now); }
      }
    };
    clock.wake = (time, now) => {
      const due = now + activityDelay(Math.abs(time - now));
      if (due >= clock.due || document.hidden || grid.destroyed) return;
      clearTimeout(clock.timer); clock.due = due; clock.timer = setTimeout(tick, due - now);
    };
    clock.add = (element, time, now) => {
      // Scrolling replaces cells; a long cadence would otherwise keep the retired ones until the next tick.
      if (clock.times.size >= 512) for (const item of clock.times.keys()) if (!item.isConnected) clock.times.delete(item);
      clock.times.set(element, time); clock.wake(time, now);
    };
    document.addEventListener("visibilitychange", tick, { signal });
    signal.addEventListener("abort", () => { clearTimeout(clock.timer); clock.times.clear(); }, { once: true });
    return clock;
  }
  function activityTime(grid, column, options, row, cell, text, add, full) {
    const raw = cellValue(cell), time = typeof raw === "string" ? Date.parse(raw) : NaN;
    if (Number.isNaN(time)) { add(text || "—", text ? "cx-presenter-text" : "p-missing"); return; }
    const now = Date.now(), box = add("", "p-when"), shown = h("time", "p-when-text"), exact = h("span", "cx-sr-only");
    shown.dateTime = raw; setText(shown, activityRelative(grid, time, now)); setText(exact, ", " + text);
    box.title = text; box.append(shown, exact);
    const other = options.secondaryColumn && grid.columns.find(item => item.id === options.secondaryColumn);
    const secondary = other ? cellText(row.cells[other.id], other, grid.fmt) : isCellObject(cell) && cell.secondary;
    if (secondary) {
      const line = h("span", "p-sub"); setText(line, secondary); box.append(line); exact.append(",");
      // Two-line rows (automatic heights and the record panel) put the secondary text under the time.
      if (full || grid.autoRows) box.classList.add("p-stack");
    }
    activityClock(grid).add(shown, time, now);
  }
