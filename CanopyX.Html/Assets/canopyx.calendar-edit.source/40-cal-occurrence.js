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

  Object.assign(DataGrid.prototype, {
    /** The way an occurrence change applies: the preset, the host's hook, or the reader's choice; null when cancelled. */
    async calOccurrenceMode(event, proposal) {
      let mode = this.cal.occurrence;
      const hook = this.opts.calendar?.occurrence;
      if (typeof hook === "function") {
        let decided;
        try { decided = await hook(Object.freeze({ id: event.key, occurrence: calIso(event.start), start: calIso(proposal.start), end: calIso(proposal.end), resource: proposal.resource ?? null })); }
        catch (error) { this.emit("error", { error }); return null; }
        if (decided === false) return null;
        if (["this", "following", "all"].includes(decided)) mode = decided;
      }
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
    /** "This event": an overriding record for the occurrence at the proposal's times. */
    async calApplyThis(event, proposal) {
      const cal = this.cal, cells = this.calSeriesValues(event);
      cells[cal.series.id] = event.key; cells[cal.recurrenceId.id] = calIso(event.start);
      cells[cal.start.id] = calIso(proposal.start);
      if (cal.end) cells[cal.end.id] = calIso(proposal.end);
      if (cal.resource?.editable && proposal.resource !== undefined) cells[cal.resource.id] = proposal.resource;
      await this.loadEditing();
      const result = await this.insertRow({ cells });
      if (!result.applied) return false;
      this.calVersion++;
      this.calAnnounce(fill(this.calLabels.calendarMoved, { title: event.title, time: this.calFmt.shortDay(this.calZone.day(proposal.start)) + (proposal.allDay ? "" : " " + this.calFmt.time(proposal.start)) }));
      if (!result.valid) { this.calInvalidInsert(result); return true; }
      if ((cal.editable?.commit ?? "auto") === "manual") { this.calReload({ keep: true }); return true; }
      return this.calCommit([result.id], event.title);
    },
    /** "This and following events": the series ends before the occurrence, and a new series starts at it with the rest of the rule. */
    async calApplyFollowing(event, proposal) {
      const cal = this.cal, labels = this.calLabels, base = event.base;
      // Overriding records after the split would still name the old series, and the new one would show those occurrences again.
      // So would a new series on another day: its rule names the old days (BYDAY, BYMONTHDAY) and its exceptions the old ones.
      const seriesZone = base.allDay ? calZone("utc") : this.calSeriesZone;
      if (this.calOverridden(event) !== false || seriesZone.day(proposal.start) !== seriesZone.day(event.start)) { this.calAnnounce(labels.calendarSeriesTime); this.calNotice(labels.calendarSeriesTime, true, true); return false; }
      const text = String(cellValue(base.row.cells[cal.recurrence.id]) ?? ""), parts = calRuleParts(text);
      const count = parts.find(([name]) => name === "COUNT"), kept = parts.filter(([name]) => name !== "COUNT" && name !== "UNTIL");
      const rec = DataGrid.prototype.calKit, zone = base.allDay ? calZone("utc") : this.calSeriesZone;
      // COUNT counts every occurrence the rule makes, excluded ones too (RFC 5545).
      const before = count ? rec.calExpand(base.rule, base.start, base.end - base.start, zone, base.start, event.start, new Set(), new Set(), 100000).length : 0;
      const oldRule = calRuleText(count ? [...kept, ["COUNT", String(Math.max(1, before))]] : [...kept, ["UNTIL", calUntilText(event.start - 1000, base.allDay)]]);
      const newRule = calRuleText(count ? [...kept, ["COUNT", String(Math.max(1, Number(count[1]) - before))]] : parts);
      const cells = this.calSeriesValues(event);
      cells[cal.recurrence.id] = newRule;
      // The new series keeps the exceptions from the occurrence on; timed ones move with its new wall-clock time.
      if (cal.exceptions) {
        const minutes = zone.parts(proposal.start).minutes - zone.parts(event.start).minutes, shift = time => zone.instant(zone.day(time), zone.parts(time).minutes + minutes);
        const list = [...[...(base.excludedDays || [])].filter(day => day >= zone.day(event.start)).map(calDayText), ...[...(base.excluded || [])].filter(time => time >= event.start).map(time => calIso(shift(time)))];
        cells[cal.exceptions.id] = list.length ? list.join(",") : null;
      }
      cells[cal.start.id] = calIso(proposal.start);
      if (cal.end) cells[cal.end.id] = calIso(proposal.end);
      if (cal.resource?.editable && proposal.resource !== undefined) cells[cal.resource.id] = proposal.resource;
      await this.loadEditing();
      calWrapEditRecord();
      const spec = this.edit.specs.get(cal.recurrence.id);
      if (!spec) { this.emit("error", { error: new Error("CanopyX: the calendar recurrence column is not editable.") }); this.calNotice(labels.calendarSeriesTime, true, true); return false; }
      // Both changes are one undo step, made at once: the new series first, then the old one's end; a refusal of either keeps neither.
      let inserted = null;
      const done = this.editGroupIf(() => {
        inserted = this.editInsertNow({ cells }, "calendar");
        if (!inserted.applied) return false;
        let cut = false;
        try { cut = this.editApply(event.key, spec, oldRule, "calendar", this.editRecord(event.key)); }
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
