  // ---------- calendar: moving and resizing events through the grid's editing contract ----------
  // A calendar is read-only unless its settings say editable. Moving or resizing an event (pointer or keyboard) proposes new
  // start, end and resource values; the proposal is checked first (no overlap on the resource when overlap is off, the
  // resources the record allows, working hours and unavailable time) and a refused proposal shows why before the drop. An
  // accepted one goes through the editing part: setCellValue for each changed column as one undo step, validation, the dirty
  // marks and, with commit "auto" (the default), commitChanges, which reaches the host's writer and its conflict check. A
  // failed save puts the event back. Moving an occurrence of a series moves the whole series: canopyx:occurrenceChange comes
  // first, and a host that cancels it keeps the series and handles the one occurrence itself (docs/calendar.md#recurrence).
  Object.assign(DataGrid.prototype, {
    /** Whether an event can be moved (move true) or resized: the settings, the editable columns and the record. */
    calCanEdit(event, resize) {
      const edit = this.cal.editable;
      if (!edit || !event || event.background || event.base?.external || this.editReadOnly || !this.edit || this.destroyed) return false;
      if (resize ? !edit.resize || event.marker : !edit.move) return false;
      const columns = [this.cal.start, resize || !event.marker ? this.cal.end : null].filter(Boolean);
      const record = this.editRecord?.(event.key) || event.row;
      return columns.every(column => column.editable && this.canEditCell(record, column.id)) && (!event.recurring || !!this.cal.recurrence);
    },

    /** The proposal's problems, first one wins: null when it may be dropped. */
    calCheck(event, proposal) {
      const edit = this.cal.editable, labels = this.calLabels;
      const resource = proposal.resource;
      if (!this.edit || this.destroyed) return labels.calendarUnavailable;
      const resize = proposal.end - proposal.start !== event.end - event.start;
      if (!this.calCanEdit(event, resize)) return this.edit.labels.gridEditNotSaved;
      if (resource !== undefined && resource !== event.resource && (!edit.resources || !this.cal.resource ||
          !this.canEditCell(this.editRecord?.(event.key) || event.row, this.cal.resource.id))) return this.edit.labels.gridEditNotSaved;
      if (!this.calAllowsSpan(proposal.start, proposal.end, proposal.allDay)) return labels.calendarOutsideRange;
      // A series moves within its own day: changing its day would leave its rule's days, exceptions and moved occurrences behind.
      // When one occurrence may change alone (occurrence "ask", "this" or "following"), the choice comes after the drop.
      if (event.recurring && this.cal.occurrence === "all") {
        const zone = event.allDay ? calZone("utc") : this.calSeriesZone;
        if (zone.day(proposal.start) !== zone.day(event.start) || this.calOverridden(event) === true ||
            event.base.excluded?.size && !this.canEditCell(this.editRecord(event.key) || event.row, this.cal.exceptions.id)) return labels.calendarSeriesTime;
      }
      if (edit.allowed && resource != null) {
        const allowed = String(cellValue(event.row.cells[edit.allowed.id]) ?? "").split(/[\s,;]+/).filter(Boolean);
        if (allowed.length && !allowed.includes(resource)) return fill(labels.calendarNotAllowed, { resource: this.calResourceName ? this.calResourceName(resource) : resource });
      }
      if (edit.working && !proposal.allDay) {
        const zone = this.calZone, first = zone.day(proposal.start), last = zone.day(Math.max(proposal.start, proposal.end - 1));
        for (let day = first; day <= last; day++) {
          const from = day === first ? zone.parts(proposal.start).minutes : 0, to = day === last ? zone.parts(proposal.end).minutes || 1440 : 1440;
          const hours = this.calHoursFor?.(resource, calDow(day)) ?? (this.cal.working ? (this.cal.working.days.has(calDow(day)) ? [this.cal.working] : []) : null);
          if (hours && !hours.some(span => from >= span.start && to <= span.end)) return labels.calendarOutsideHours;
        }
      }
      for (const range of this.calRanges) if (range.kind === "unavailable" && (range.resource == null || range.resource === resource) && calOverlaps(proposal.start, proposal.end, range.start, range.end)) return labels.calendarUnavailable;
      if (!edit.overlap) {
        for (const other of this.calEvents) {
          if (other.key === event.key || other.background || (this.cal.resource && other.resource !== resource)) continue;
          if (other.start < proposal.end && other.end > proposal.start || other.marker && other.start >= proposal.start && other.start < proposal.end) return fill(labels.calendarConflict, { title: other.title });
        }
      }
      return null;
    },

    /** Applies an accepted proposal through the editing part; resolves true once it is saved (or kept, with commit manual). */
    async calApply(event, proposal) {
      const cal = this.cal, labels = this.calLabels, delta = proposal.start - event.start;
      await this.loadEditing();
      calWrapEditRecord();
      const problem = this.calCheck(event, proposal);
      if (problem) { this.calAnnounce(problem); this.calNotice(problem, true, true); return false; }
      if (event.recurring && !this.emit("occurrenceChange", { id: event.key, occurrence: calIso(event.start), start: calIso(proposal.start), end: calIso(proposal.end), resource: proposal.resource ?? null }))
        return false;
      if (event.recurring && this.cal.occurrence !== "all") {
        const mode = await this.calOccurrenceMode(event, proposal);
        if (!mode) return false;
        const currentProblem = this.calCheck(event, proposal);
        if (currentProblem) { this.calAnnounce(currentProblem); this.calNotice(currentProblem, true, true); return false; }
        if (mode === "this") return this.calApplyThis(event, proposal);
        if (mode === "following" && event.start !== event.base.start) return this.calApplyFollowing(event, proposal);
        // "All events" (or the series' first occurrence and the ones after it): the series rules apply now.
        const zone = event.allDay ? calZone("utc") : this.calSeriesZone;
        if (zone.day(proposal.start) !== zone.day(event.start) || this.calOverridden(event) === true ||
            event.base.excluded?.size && !this.canEditCell(this.editRecord(event.key) || event.row, this.cal.exceptions.id)) {
          this.calAnnounce(labels.calendarSeriesTime); this.calNotice(labels.calendarSeriesTime, true, true); return false;
        }
      }
      // A hosted calendar cannot see overriding records outside the rows it loaded: unless the host took the occurrence above,
      // a series that may have them stays where it is.
      if (event.recurring && this.calOverridden(event) !== false) { this.calAnnounce(labels.calendarSeriesTime); this.calNotice(labels.calendarSeriesTime, true, true); return false; }
      // An occurrence of a series moves the series by the same wall-clock minutes in its zone (the day stays; calCheck refuses
      // another), changes its length by the same amount, and takes its excluded instants along.
      const base = event.base, values = [], stretch = (proposal.end - proposal.start) - (event.end - event.start);
      let start = proposal.start, end = proposal.end;
      if (event.recurring) {
        const zone = event.allDay ? calZone("utc") : this.calSeriesZone, minutes = zone.parts(proposal.start).minutes - zone.parts(event.start).minutes;
        const shift = time => zone.instant(zone.day(time), zone.parts(time).minutes + minutes);
        start = shift(base.start); end = start + (base.end - base.start) + stretch;
        if (minutes && base.excluded?.size) values.push([cal.exceptions.id, [...[...base.excludedDays].map(calDayText), ...[...base.excluded].map(time => calIso(shift(time)))].join(",")]);
      }
      values.unshift([cal.start.id, calIso(start)]);
      if (cal.end && (end !== base.end || start !== base.start)) values.push([cal.end.id, end > start || !base.marker ? calIso(end) : null]);
      if (cal.resource && proposal.resource !== undefined && proposal.resource !== event.resource) values.push([cal.resource.id, proposal.resource]);
      // A refused change takes back only the columns this move set, never the record's other unsaved edits.
      const record = this.editRecord(event.key), applied = [];
      if (values.some(([column]) => !this.canEditCell(record, column))) {
        this.calAnnounce(this.edit.labels.gridEditNotSaved); this.calNotice(this.edit.labels.gridEditNotSaved, true, true); return false;
      }
      let failed = null;
      this.editGroup(() => {
        for (const [column, value] of values) {
          const spec = this.edit.specs.get(column);
          if (!spec) { failed = new Error("CanopyX: the calendar column " + column + " is not editable."); return; }
          const previous = cellValue(record?.cells[column]);
          if (!this.editApply(event.key, spec, value, "calendar", record)) { failed = false; return; }
          applied.push([spec, previous]);
        }
      });
      if (failed !== null) {
        if (failed) this.emit("error", { error: failed });
        if (applied.length) this.edit.undo.pop();
        for (const [spec, previous] of applied.reverse()) this.editApply(event.key, spec, previous, "undo", record);
        return false;
      }
      this.calVersion++;
      const time = this.calFmt.shortDay(this.calZone.day(proposal.start)) + " " + (proposal.allDay ? "" : this.calFmt.time(proposal.start));
      this.calAnnounce(event.recurring ? fill(labels.calendarSeriesMoved, { title: event.title }) : delta ? fill(labels.calendarMoved, { title: event.title, time }) : fill(labels.calendarResized, { title: event.title, time: this.calFmt.time(proposal.end) }));
      if (cal.editable.commit === "manual") { this.calReload({ keep: true }); return true; }
      return this.calCommit([event.key], event.title);
    },
    /** Commits rows; a refused or failed save puts them back, unless keep leaves them unsaved for another try. */
    async calCommit(ids, title, keep) {
      try {
        const result = await this.commitChanges({ ids });
        if (result && result.failed) {
          const row = (result.rows || []).find(item => item.status !== "saved");
          throw new Error(row?.error || (row?.status === "conflict" ? this.edit.labels.gridEditConflict : this.edit.labels.gridEditNotSaved));
        }
        this.calNotice("", false);
        return true;
      } catch (error) {
        if (!keep) this.revertChanges(ids);
        const text = fill(this.calLabels.calendarSaveFailed, { title: title || "", error: error.message });
        this.calNotice(text, true, true); this.calAnnounce(text);
        return false;
      } finally { this.calVersion++; this.calCache?.clear(); this.calReload({ keep: true }); }
    }
  });

  Object.assign(DataGrid.prototype, {
    /**
     * Whether a series has overriding records: true or false when the calendar can know (every inline record, whatever the
     * reader's search or filters), null for a hosted calendar that did not load one (it may lie in another range).
     */
    calOverridden(event) {
      if (event.base.overridden) return true;
      if (!this.cal.series) return false;
      if (this.view.source.kind !== "inline" || this.opts.source) return null;
      const rows = this.view.rows, column = this.cal.series.id;
      if (this.calSeriesIndex?.rows !== rows || this.calSeriesIndex.version !== this.calVersion) {
        const ids = new Set();
        for (const row of rows) { const value = cellValue(row.cells[column]); if (value != null && value !== "") ids.add(String(value)); }
        this.calSeriesIndex = { rows, version: this.calVersion, ids };
      }
      return this.calSeriesIndex.ids.has(String(event.base.key));
    }
  });

  /** Lets the editing part find the records a hosted calendar loaded for its range, which the table may not have loaded. */
  function calWrapEditRecord() {
    const current = DataGrid.prototype.editRecord;
    if (!current || current._calendar) return;
    DataGrid.prototype.editRecord = function (id) {
      const found = current.call(this, id);
      if (found || !this.cal) return found;
      const event = this.calEvents.find(item => item.key === id);
      return event ? JSON.parse(JSON.stringify(event.base.row)) : found;
    };
    DataGrid.prototype.editRecord._calendar = true;
  }
