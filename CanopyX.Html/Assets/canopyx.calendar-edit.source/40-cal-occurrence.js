  // ---------- calendar: changing one occurrence of a series ----------
  // Moving or resizing an occurrence changes "this event" (a new overriding record: series and recurrenceId point at the
  // occurrence, the series skips it), "this and following events" (the series ends before the occurrence through its rule's
  // UNTIL or COUNT, and a new series starts at the occurrence with the rest of the rule), or "all events" (the whole series, by
  // the same wall-clock minutes, within its day). The calendar's occurrence setting presets the choice; "ask" opens a small
  // dialog; a host hook (calendar.occurrence in the grid options) may decide first. Every way goes through the editing
  // contract: updates, inserts, undo and the writer.
  const CAL_RULE_SPLIT = /;\s*/;
  /** A rule's parts as [name, value] pairs in their order, without the RRULE: prefix. */
  function calRuleParts(text) {
    return String(text).trim().replace(/^RRULE:/i, "").split(CAL_RULE_SPLIT).filter(Boolean).map(part => { const at = part.indexOf("="); return [part.slice(0, at).trim().toUpperCase(), part.slice(at + 1).trim()]; });
  }
  const calRuleText = parts => parts.map(([name, value]) => name + "=" + value).join(";");
  /** UNTIL in iCalendar form: a date for all-day series, else UTC date and time. */
  function calUntilText(time, allDay) {
    const iso = new Date(time).toISOString();
    return allDay ? iso.slice(0, 10).replace(/-/g, "") : iso.slice(0, 19).replace(/[-:]/g, "") + "Z";
  }
  const calMoveTime = (time, zone, minutes) => minutes ? zone.instant(zone.day(time), zone.parts(time).minutes + minutes) + (time % CAL_MINUTE + CAL_MINUTE) % CAL_MINUTE : time;
  /** A timed UNTIL follows the series' wall-clock move; null refuses a boundary that cannot be certified. */
  function calMovedRule(text, base, zone, start) {
    const minutes = zone.parts(start).minutes - zone.parts(base.start).minutes;
    const until = base.rule.until;
    if (!minutes || !until || until.time === undefined && until.minutes === undefined) return text;
    const time = until.time ?? zone.instant(until.day, until.minutes);
    let shifted = calMoveTime(time, zone, minutes);
    // Each occurrence keeps its date. Only the cutoff date or its preceding date can cross the moved boundary; civil
    // midnight includes offset changes without assuming a 24-hour day. UNTIL has no COUNT, so expansion jumps here.
    const boundary = DataGrid.prototype.calKit.calExpand(base.rule, base.start, 0, zone, zone.start(zone.day(time) - 1), time + 1, new Set(), new Set(), 8);
    if (boundary.length === 8) return null;
    // Use the new master's actual clock, including gap resolution, rather than shifting the old resolved occurrence.
    const last = boundary.at(-1);
    if (last !== undefined) {
      const rec = DataGrid.prototype.calKit, open = rec.calRule(calRuleText(calRuleParts(text).filter(([name]) => name !== "UNTIL")));
      const candidates = rec.calExpand(open, start, 0, zone, zone.start(zone.day(last) - 1), zone.start(zone.day(last) + 1), new Set(), new Set(), 8);
      const moved = candidates.find(time => zone.day(time) === zone.day(last));
      if (candidates.length === 8 || moved === undefined) return null;
      shifted = Math.max(shifted, Math.ceil(moved / 1000) * 1000);
    }
    const value = until.time !== undefined ? calUntilText(shifted, false) :
      calUntilText(zone.day(shifted) * CAL_DAY + zone.parts(shifted).minutes * CAL_MINUTE + (shifted % CAL_MINUTE + CAL_MINUTE) % CAL_MINUTE, false).slice(0, -1);
    return calRuleText(calRuleParts(text).map(([name, valueNow]) => [name, name === "UNTIL" ? value : valueNow]));
  }

  Object.assign(DataGrid.prototype, {
    /** A pending choice belongs to this provider, writer and selected calendar identity, not a later row with the same id. */
    calEditSnapshot(event) {
      const columns = [this.cal.start, this.cal.end, this.cal.allDay, this.cal.resource, this.cal.recurrence, this.cal.exceptions, this.cal.series, this.cal.recurrenceId].filter(Boolean);
      return { cal: this.cal, view: this.view, source: this.source, edit: this.edit, options: this.edit?.options,
        writer: this.edit?.options.commit, sourceWriter: this.source.commit,
        cells: columns.map(column => [column.id, cellValue(event.base.row.cells[column.id]) ?? null]) };
    },
    /** Refreshes unrelated values only after the original master and occurrence still match both accepted and editing rows. */
    calEditCurrent(event, decision) {
      if (this.destroyed || !this.calBody?.isConnected || !this.calAnswer || this.calAnswer.source !== decision.source || this.cal !== decision.cal || this.view !== decision.view ||
          this.source !== decision.source || this.edit !== decision.edit || this.edit?.options !== decision.options ||
          this.edit?.options.commit !== decision.writer || this.source.commit !== decision.sourceWriter) return null;
      const current = this.calEvents.find(item => item.id === event.id && item.key === event.key && item.start === event.start && item.end === event.end);
      if (!current) return null;
      const record = this.editRecord(event.key) || current.base.row;
      if (decision.cells.some(([id, value]) => (cellValue(current.base.row.cells[id]) ?? null) !== value || (cellValue(record.cells[id]) ?? null) !== value)) return null;
      return { ...current, row: record, base: { ...current.base, row: record } };
    },
    calRefuseDecision() {
      if (!this.destroyed && this.calBody?.isConnected) { this.calAnnounce(this.calLabels.calendarUnavailable); this.calNotice(this.calLabels.calendarUnavailable, true, true); }
      return false;
    },
    /** One saved candidate supplies both final policy spans and writer values. No expansion runs during pointer previews. */
    calOccurrencePlan(event, proposal, mode) {
      const cal = this.cal, base = event.base, zone = base.seriesZone, rec = this.calKit;
      const refused = () => ({ problem: this.calLabels.calendarSeriesTime });
      if (mode === "following" && event.start === base.start) mode = "all";
      const resource = proposal.resource !== undefined ? proposal.resource : event.resource, cells = this.calSeriesValues(event);
      cells[cal.start.id] = calIso(proposal.start);
      if (cal.end) cells[cal.end.id] = calIso(proposal.end);
      if (cal.resource && proposal.resource !== undefined && (mode !== "all" || proposal.resource !== event.resource)) cells[cal.resource.id] = proposal.resource;
      if (mode === "this") {
        if (!cal.series || !cal.recurrenceId) return refused();
        cells[cal.series.id] = event.key; cells[cal.recurrenceId.id] = calIso(event.start);
        return { mode, cells, spans: [{ ...proposal, resource }] };
      }
      if (zone.day(proposal.start) !== zone.day(event.start) || this.calOverridden(event) !== false) return refused();
      const minutes = zone.parts(proposal.start).minutes - zone.parts(event.start).minutes;
      const start = mode === "all" ? calMoveTime(base.start, zone, minutes) : proposal.start;
      const duration = mode === "all" ? base.end - base.start + proposal.end - proposal.start - (event.end - event.start) : proposal.end - proposal.start;
      const text = String(cellValue(base.row.cells[cal.recurrence.id]) ?? ""), parts = calRuleParts(text);
      let ruleText = text, oldRule = null;
      if (mode === "following") {
        const count = parts.find(([name]) => name === "COUNT"), kept = parts.filter(([name]) => name !== "COUNT" && name !== "UNTIL");
        // COUNT includes excluded occurrences. This is one split count, never a walk per loaded occurrence or exception.
        const before = count ? rec.calExpand(base.rule, base.start, 0, zone, base.start, event.start, new Set(), new Set(), 10000).length : 0;
        oldRule = calRuleText(count ? [...kept, ["COUNT", String(Math.max(1, before))]] : [...kept, ["UNTIL", calUntilText(event.start - 1000, base.allDay)]]);
        ruleText = calRuleText(count ? [...kept, ["COUNT", String(Math.max(1, Number(count[1]) - before))]] : parts);
      }
      ruleText = calMovedRule(ruleText, base, zone, start);
      if (ruleText === null) return refused();
      const rule = rec.calRule(ruleText), excluded = [...base.excluded].filter(time => mode === "all" || time >= event.start);
      const excludedDays = new Set([...base.excludedDays].filter(day => mode === "all" || day >= zone.day(event.start)));
      const from = base.allDay ? this.calRange.firstDay * CAL_DAY : this.calZone.start(this.calRange.firstDay);
      const to = base.allDay ? (this.calRange.lastDay + 1) * CAL_DAY : this.calZone.start(this.calRange.lastDay + 1);
      const loadedDays = new Set(this.calEvents.filter(other => other.key === event.key).map(other => zone.day(other.start)));
      // The supported move keeps civil dates. One batched window also certifies timed EXDATE identities outside the view;
      // the existing output limit plus a sentinel refuses a window whose identity mapping cannot be certified.
      let first = from, last = to;
      for (const day of [...loadedDays, ...excluded.map(time => zone.day(time)), zone.day(event.start)]) {
        first = Math.min(first, zone.start(day)); last = Math.max(last, zone.start(day + 1));
      }
      const original = rec.calExpand(base.rule, base.start, Math.max(base.end - base.start, duration), zone, first, last, new Set(), new Set(), cal.limit + 1);
      const candidate = rec.calExpand(rule, start, duration, zone, first, last, new Set(), new Set(), cal.limit + 1);
      if (original.length > cal.limit || candidate.length > cal.limit) return refused();
      const originalStarts = new Set(original), byDay = new Map(candidate.map(time => [zone.day(time), time])), movedExcluded = new Set();
      if (byDay.size !== candidate.length) return refused();
      for (const time of excluded) {
        const moved = byDay.get(zone.day(time));
        if (!originalStarts.has(time) || moved === undefined) return refused();
        movedExcluded.add(moved);
      }
      if (byDay.get(zone.day(event.start)) !== proposal.start || proposal.end !== proposal.start + duration) return refused();
      const sameExcluded = excluded.length === movedExcluded.size && excluded.every(time => movedExcluded.has(time));
      if (mode === "all" && !sameExcluded && !this.canEditCell(this.editRecord(event.key), cal.exceptions.id)) return refused();
      cells[cal.start.id] = calIso(start);
      if (cal.end) cells[cal.end.id] = duration > 0 || !base.marker ? calIso(start + duration) : null;
      cells[cal.recurrence.id] = ruleText;
      // A temporal edit does not normalize untouched cell text. Only changed timed identities require a new EXDATE value.
      if (cal.exceptions) cells[cal.exceptions.id] = mode === "all" && sameExcluded ?
        cellValue(base.row.cells[cal.exceptions.id]) : [...[...excludedDays].map(calDayText), ...[...movedExcluded].map(calIso)].join(",") || null;
      const spans = candidate.filter(time => !movedExcluded.has(time) && !excludedDays.has(zone.day(time)) &&
        (loadedDays.has(zone.day(time)) || calOverlaps(time, time + duration, from, to)))
        .map(time => ({ start: time, end: time + duration, allDay: base.allDay, resource }));
      const values = [[cal.start.id, cells[cal.start.id]]];
      for (const column of [cal.end, cal.resource, cal.recurrence, cal.exceptions].filter(Boolean))
        if ((cells[column.id] ?? null) !== (cellValue(base.row.cells[column.id]) ?? null)) values.push([column.id, cells[column.id]]);
      return { mode, cells, values, oldRule, spans };
    },
    /** The way an occurrence change applies: the preset, the host's hook, or the reader's choice; null when cancelled. */
    async calOccurrenceMode(event, proposal, decision) {
      let mode = this.cal.occurrence;
      const hook = this.opts.calendar?.occurrence;
      if (typeof hook === "function") {
        let decided;
        try { decided = await hook(Object.freeze({ id: event.key, occurrence: calIso(event.start), start: calIso(proposal.start), end: calIso(proposal.end), resource: proposal.resource ?? null })); }
        catch (error) { this.emit("error", { error }); return null; }
        if (decided === false) return null;
        if (["this", "following", "all"].includes(decided)) mode = decided;
      }
      if (decision && !this.calEditCurrent(event, decision)) return null;
      return mode === "ask" ? this.calAskOccurrence(event) : mode;
    },
    /** The dialog: This event, This and following events, All events, Cancel. Resolves with the choice or null. */
    calAskOccurrence(event) {
      return new Promise(resolve => {
        this.calCloseAsk(null);
        const labels = this.calLabels, panel = this.calAsk = h("div", "cx-cal-ask"), titleId = this.id + "-cal-ask", title = h("h3", "cx-cal-create-h"), what = h("p", "cx-cal-det-when");
        panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false"); panel.setAttribute("aria-labelledby", titleId);
        title.id = titleId; setText(title, labels.calendarOccurrenceTitle); setText(what, event.title + " · " + this.calTimeText(event));
        const buttons = [["this", labels.calendarThisEvent], ["following", labels.calendarThisAndFollowing], ["all", labels.calendarAllEvents], [null, labels.calendarCancel]].map(([mode, text]) => {
          const button = h("button", "cx-btn" + (mode ? "" : " ghost") + " cx-cal-ask-" + (mode || "cancel")); button.type = "button"; setText(button, text);
          button.addEventListener("click", () => this.calCloseAsk(mode));
          return button;
        });
        const actions = h("div", "cx-cal-ask-actions"); actions.append(...buttons);
        panel.append(title, what, actions);
        panel._calResolve = resolve; panel._calReturn = document.activeElement;
        this.calPlace(panel, this.calBody.querySelector('[data-cx-event="' + CSS.escape(event.id) + '"]') || this.calBody);
        panel.addEventListener("keydown", key => {
          const at = buttons.indexOf(document.activeElement);
          if (key.key === "Escape") { key.preventDefault(); key.stopPropagation(); this.calCloseAsk(null); }
          else if (key.key === "Tab") { key.preventDefault(); buttons[(at + (key.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus(); }
          else if (key.key === "ArrowDown" || key.key === "ArrowRight") { key.preventDefault(); buttons[(at + 1) % buttons.length].focus(); }
          else if (key.key === "ArrowUp" || key.key === "ArrowLeft") { key.preventDefault(); buttons[(at + buttons.length - 1) % buttons.length].focus(); }
        });
        buttons[0].focus({ preventScroll: true });
      });
    },
    calCloseAsk(mode) {
      const panel = this.calAsk;
      if (!panel) return;
      this.calAsk = null; panel.remove();
      if (panel._calReturn?.isConnected) panel._calReturn.focus({ preventScroll: true });
      panel._calResolve(mode);
    },

    /** The series' raw values, for the records a change of one occurrence writes. */
    calSeriesValues(event) {
      const values = Object.create(null), cal = this.cal, skip = new Set([cal.recurrence?.id, cal.exceptions?.id, cal.seriesEnd?.id, cal.series?.id, cal.recurrenceId?.id].filter(Boolean));
      for (const [id, cell] of Object.entries(event.base.row.cells)) if (!skip.has(id)) values[id] = cellValue(cell) ?? null;
      return values;
    },
    /** A local insert keeps all its cells; a writer receives only editable values, so it cannot copy a read-only value. */
    calOccurrenceCopyProblem(cells) {
      if (this.editOwnsRows() && !this.edit.options.commit && typeof this.source.commit !== "function") return null;
      return Object.keys(cells).some(id => cells[id] != null && !this.edit.specs.has(id)) ? this.calLabels.calendarOccurrenceReadOnly : null;
    },
    /** "This event": an overriding record for the occurrence at the proposal's times. */
    async calApplyThis(event, proposal, plan, decision) {
      const cal = this.cal, cells = plan.cells;
      event = this.calEditCurrent(event, decision);
      if (!event) return this.calRefuseDecision();
      const problem = this.calCheck(event, proposal, plan) || this.calOccurrenceCopyProblem(cells);
      if (problem) { this.calAnnounce(problem); this.calNotice(problem, true, true); return false; }
      const result = await this.insertRow({ cells });
      if (!result.applied) return false;
      this.calVersion++;
      this.calAnnounce(fill(this.calLabels.calendarMoved, { title: event.title, time: this.calFmt.shortDay(this.calZone.day(proposal.start)) + (proposal.allDay ? "" : " " + this.calFmt.time(proposal.start)) }));
      if (!result.valid) { this.calInvalidInsert(result); return true; }
      if ((cal.editable?.commit ?? "auto") === "manual") { this.calReload({ keep: true }); return true; }
      return this.calCommit([result.id], event.title);
    },
    /** "This and following events": the series ends before the occurrence, and a new series starts at it with the rest of the rule. */
    async calApplyFollowing(event, proposal, plan, decision) {
      const cal = this.cal, labels = this.calLabels, cells = plan.cells;
      calWrapEditRecord();
      event = this.calEditCurrent(event, decision);
      if (!event) return this.calRefuseDecision();
      const problem = this.calCheck(event, proposal, plan) || this.calOccurrenceCopyProblem(cells);
      if (problem) { this.calAnnounce(problem); this.calNotice(problem, true, true); return false; }
      const spec = this.edit.specs.get(cal.recurrence.id);
      if (!spec) { this.emit("error", { error: new Error("CanopyX: the calendar recurrence column is not editable.") }); this.calNotice(labels.calendarSeriesTime, true, true); return false; }
      if (!this.canEditCell(this.editRecord(event.key), cal.recurrence.id)) { this.calAnnounce(this.edit.labels.gridEditNotSaved); this.calNotice(this.edit.labels.gridEditNotSaved, true, true); return false; }
      // Both changes are one undo step, made at once: the new series first, then the old one's end; a refusal of either keeps neither.
      let inserted = null;
      const done = this.editGroupIf(() => {
        inserted = this.editInsertNow({ cells }, "calendar");
        if (!inserted.applied) return false;
        let cut = false;
        try { cut = this.editApply(event.key, spec, plan.oldRule, "calendar", this.editRecord(event.key)); }
        finally { if (!cut) this.editRemoveInserted(inserted.id); }
        return cut;
      });
      if (!done) return false;
      const check = await this.editValidateRow(inserted.id);
      this.calVersion++;
      this.calAnnounce(fill(labels.calendarMoved, { title: event.title, time: this.calFmt.shortDay(this.calZone.day(proposal.start)) + (proposal.allDay ? "" : " " + this.calFmt.time(proposal.start)) }));
      if (!check.valid) { this.calInvalidInsert({ id: inserted.id, errors: check.errors }); return true; }
      if ((cal.editable?.commit ?? "auto") === "manual") { this.calReload({ keep: true }); return true; }
      // The old series is cut first and the new one sent once that is stored: a failure never leaves both series whole on the
      // server. If the old series cannot be cut, neither change stays (nor an undo step that would cut it again later). If the
      // new series cannot be stored, it stays unsaved, with the reason, so it can be saved again instead of being lost.
      const history = this.edit.undo.length;
      if (!await this.calCommit([event.key], event.title)) {
        this.edit.undo.length = Math.max(0, history - 1); this.edit.redo.length = 0;
        this.editRemoveInserted(inserted.id, true); this.calReload({ keep: true });
        return false;
      }
      return this.calCommit([inserted.id], event.title, true);
    },
    /** A new record that fails its checks stays pending, and the calendar says why. */
    calInvalidInsert(result) {
      const message = Object.values(result.errors || {})[0] || this.edit.labels.gridEditNotSaved;
      this.calNotice(message, true, true); this.calAnnounce(message);
      this.calReload({ keep: true });
    }  });
