  // ---------- activity part: monospace logs ----------
  // Lines come from the host: a timeline value (events with time, kind as the level, summary as the message and an optional
  // tone), or the lines of a text value, which split: true reads as "time level message". Nothing else is parsed.
  const LOG_TONES = { error: "danger", err: "danger", fatal: "danger", critical: "danger", failed: "danger", warn: "warning", warning: "warning",
    info: "info", information: "info", notice: "info", debug: "muted", trace: "muted", verbose: "muted" };
  const logClock = (date, local) => [local ? date.getHours() : date.getUTCHours(), local ? date.getMinutes() : date.getUTCMinutes(),
    local ? date.getSeconds() : date.getUTCSeconds()].map(part => String(part).padStart(2, "0")).join(":");
  function logEntries(grid, cell, raw, split) {
    if (isCellObject(cell) && Array.isArray(cell.events)) return cell.events.map(event => {
      const date = event.time ? new Date(event.time) : null, known = date && !Number.isNaN(date.getTime());
      return { time: known ? logClock(date, grid.fmt.local) : "", exact: known ? formatValue(event.time, "datetime", grid.fmt) : "",
        level: event.kind || "", message: event.summary, tone: event.tone };
    });
    return typeof raw !== "string" || !raw ? [] : raw.split(/\r?\n/).map(line => {
      const parts = split && /^(\S+(?: \d{1,2}:\d\d\S*)?)\s+([A-Za-z]{1,12}):?\s+(.*)$/.exec(line);
      return parts ? { time: parts[1], level: parts[2], message: parts[3] } : { time: "", level: "", message: line };
    });
  }
  function logLine(options, entry) {
    const line = h("div", "p-log-line");
    if (entry.time) { const time = h("span", "p-log-time"); setText(time, entry.time); if (entry.exact) time.title = entry.exact; line.append(time); }
    if (entry.level) {
      const level = h("span"); setText(level, entry.level);
      applyTone(level, "p-log-level", toneOf(entry.tone || gridPresenterTone(options, entry.level, LOG_TONES[entry.level.toLowerCase()])));
      line.append(level);
    }
    const message = h("span", "p-log-message"); setText(message, entry.message); line.append(message);
    return line;
  }
  function logButton(label, cls, action) {
    const button = h("button", "cx-link " + cls); button.type = "button"; setText(button, label);
    button.addEventListener("click", event => { event.stopPropagation(); action(button); });
    return button;
  }
  // A fixed-height row previews the first line and opens the complete log in the text dialog. Automatic row heights, wrapped
  // columns and the record panel show up to lines entries (10 by default), a Show all control and a copy control.
  function activityLog(grid, column, options, row, cell, text, add, full) {
    const raw = cellValue(cell), entries = logEntries(grid, cell, raw, options.split);
    if (!entries.length) { add("—", "p-missing"); return; }
    const whole = isCellObject(cell) && Array.isArray(cell.events) ? entries.map(entry => [entry.time, entry.level, entry.message].filter(Boolean).join(" ")).join("\n") : raw;
    const open = grid.openLogs ||= new Set(), key = row.id + "\n" + column.id, limit = options.lines || 10;
    if (!full && !grid.autoRows) {
      const box = add("", "p-log p-log-preview"); box.append(logLine(options, entries[0]));
      if (entries.length > 1) {
        const more = logButton("+" + (entries.length - 1), "p-log-more", button => grid.showReportingText(column, whole, button, row.id, true));
        more.setAttribute("aria-haspopup", "dialog"); more.setAttribute("aria-label", more.textContent + ", " + fill(grid.labels.gridExpandCell, { column: column.title }));
        box.append(more);
      }
      return;
    }
    const box = add("", "p-log"), lines = h("div", "p-log-lines"), tools = h("div", "p-log-tools");
    for (const entry of open.has(key) ? entries : entries.slice(0, limit)) lines.append(logLine(options, entry));
    const copy = logButton("", "p-log-copy", () => {
      const clipboard = globalThis.navigator?.clipboard;
      Promise.resolve().then(() => clipboard.writeText(whole)).then(() => { if (grid.live) setText(grid.live, grid.labels.recordCopied); }, error => grid.emit("error", { error }));
    });
    copy.prepend(gridIcon("copy")); copy.title = grid.labels.gridCopy; copy.setAttribute("aria-label", grid.labels.gridCopy + ": " + column.title);
    tools.append(copy);
    if (!open.has(key) && entries.length > limit) tools.append(logButton(fill(grid.labels.recordShowAll, { count: entries.length }), "p-log-all", button => {
      // The lines join in place, so the row keeps its focus and remeasures; the choice survives a repaint of the row.
      open.add(key); for (const entry of entries.slice(limit)) lines.append(logLine(options, entry));
      copy.focus(); button.remove(); grid.measureNeeded = true; grid.scheduleRender();
    }));
    box.append(lines, tools);
  }
  function gridRenderActivity(grid, column, options, row, cell, element, text, add, full) {
    (options.kind === "log" ? activityLog : activityTime)(grid, column, options, row, cell, text, add, full);
  }
