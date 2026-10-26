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
    calCheck(event, proposal, plan) {
      const edit = this.cal.editable, labels = this.calLabels;
      const resource = proposal.resource;
      if (!this.edit || this.destroyed) return labels.calendarUnavailable;
      const resize = proposal.end - proposal.start !== event.end - event.start;
      if (!this.calCanEdit(event, resize)) return this.edit.labels.gridEditNotSaved;
      if (resource !== undefined && resource !== event.resource && (!edit.resources || !(this.cal.resource || this.cal.resourceIds) ||
          this.calResourceValues(event, resource).some(([id]) => !this.canEditCell(this.editRecord?.(event.key) || event.row, id)))) return this.edit.labels.gridEditNotSaved;
      if (!this.calAllowsSpan(proposal.start, proposal.end, proposal.allDay)) return labels.calendarOutsideRange;
      // Series-only constraints wait for the host's final occurrence choice, including when the preset is "all".
      if (edit.allowed && resource != null) {
        const allowed = String(cellValue(event.row.cells[edit.allowed.id]) ?? "").split(/[\s,;]+/).filter(Boolean);
        if (allowed.length && !allowed.includes(resource)) return fill(labels.calendarNotAllowed, { resource: this.calResourceName ? this.calResourceName(resource) : resource });
      }
      const resources = this.calEventResources(event).map(id => id === event.resource && resource !== undefined ? resource : id);
      if (resource != null && !resources.includes(resource)) resources.push(resource);
      if (!resources.length) resources.push(null);
      const spanProblem = (resources.length ? resources : [null]).map(resource => this.calSpanProblem({ ...proposal, resource })).find(Boolean);
      if (spanProblem) return spanProblem;
      if (plan) return plan.problem || this.calOccurrenceProblem(event, proposal, plan);
      if (!edit.overlap) {
        for (const other of this.calEvents) {
          if (other.base.identity === event.base.identity || other.background || ((this.cal.resource || this.cal.resourceIds) && !resources.some(id => this.calHasResource(other, id)))) continue;
          if (other.start < proposal.end && other.end > proposal.start || other.marker && other.start >= proposal.start && other.start < proposal.end) return fill(labels.calendarConflict, { title: other.title });
        }
      }
      return null;
    },

    /** The shared span rules; selected proposals retain their earlier range check for the same refusal precedence. */
    calSpanProblem(proposal) {
      const labels = this.calLabels, resource = proposal.resource;
      if (!this.calAllowsSpan(proposal.start, proposal.end, proposal.allDay)) return labels.calendarOutsideRange;
      if (this.cal.editable.working && !proposal.allDay) {
        const zone = this.calZone, first = zone.day(proposal.start), last = zone.day(Math.max(proposal.start, proposal.end - 1));
        for (let day = first; day <= last; day++) {
          const from = day === first ? zone.parts(proposal.start).minutes : 0, to = day === last ? zone.parts(proposal.end).minutes || 1440 : 1440;
          const hours = this.calHoursFor?.(resource, calDow(day)) ?? (this.cal.working ? (this.cal.working.days.has(calDow(day)) ? [this.cal.working] : []) : null);
          if (hours && !hours.some(span => from >= span.start && to <= span.end)) return labels.calendarOutsideHours;
        }
      }
      for (const range of this.calRanges) if (range.kind === "unavailable" && (range.resource == null || range.resource === resource) && calOverlaps(proposal.start, proposal.end, range.start, range.end)) return labels.calendarUnavailable;
      return null;
    },

    /** Checks the resolved recurrence change once, against the accepted occurrences in the loaded range. */
    calOccurrenceProblem(event, proposal, plan) {
      const items = this.calEvents.filter(other => !other.background && (other.base.identity !== event.base.identity ||
        plan.mode === "this" && other.id !== event.id || plan.mode === "following" && other.start < event.start))
        .map(other => ({ ...other, changed: false }));
      items.push(...plan.spans.map(span => ({ ...span, title: event.title, changed: true })));
      for (const item of items) if (item.changed) {
        const problem = [...new Set([item.resource, ...(item.resourceIds || [])])].map(resource => this.calSpanProblem({ ...item, resource, allDay: proposal.allDay })).find(Boolean);
        if (problem) return problem;
      }
      if (this.cal.editable.overlap) return null;
      const assignments = items.flatMap(item => { const ids = item.resourceIds?.length ? [...new Set([item.resource, ...item.resourceIds].filter(Boolean))] : [item.resource]; return ids.map(resource => ({ ...item, resource })); });
      assignments.sort((a, b) => a.start - b.start || b.end - a.end);
      const active = new Map();
      for (const item of assignments) {
        const resource = this.cal.resource || this.cal.resourceIds ? item.resource : null, previous = active.get(resource) || { any: null, changed: null };
        const other = item.changed ? previous.any : previous.changed;
        if (other && (calOverlaps(item.start, item.end, other.start, other.end) || calOverlaps(other.start, other.end, item.start, item.end)))
          return fill(this.calLabels.calendarConflict, { title: item.changed ? other.title : item.title });
        if (!previous.any || item.end > previous.any.end) previous.any = item;
        if (item.changed && (!previous.changed || item.end > previous.changed.end)) previous.changed = item;
        active.set(resource, previous);
      }
      return null;
    },

    /** Applies an accepted proposal through the editing part; resolves true once it is saved (or kept, with commit manual). */
    async calApply(event, proposal) {
      const cal = this.cal, labels = this.calLabels, delta = proposal.start - event.start, decision = this.calEditSnapshot(event);
      await this.loadEditing();
      calWrapEditRecord();
      event = this.calEditCurrent(event, decision);
      if (!event) return this.calRefuseDecision();
      const problem = this.calCheck(event, proposal);
      if (problem) { this.calAnnounce(problem); this.calNotice(problem, true, true); return false; }
      if (event.recurring && !this.emit("occurrenceChange", { id: event.key, occurrence: calIso(event.start), start: calIso(proposal.start), end: calIso(proposal.end), resource: proposal.resource ?? null }))
        return false;
      let plan = null;
      if (event.recurring) {
        const mode = await this.calOccurrenceMode(event, proposal, decision);
        event = this.calEditCurrent(event, decision);
        if (!event) return this.calRefuseDecision();
        if (!mode) return false;
        plan = this.calOccurrencePlan(event, proposal, mode);
        const currentProblem = this.calCheck(event, proposal, plan);
        if (currentProblem) { this.calAnnounce(currentProblem); this.calNotice(currentProblem, true, true); return false; }
        if (plan.mode === "this") return this.calApplyThis(event, proposal, plan, decision);
        if (plan.mode === "following") return this.calApplyFollowing(event, proposal, plan, decision);
      }
      const base = event.base, values = plan ? plan.values : [[cal.start.id, calIso(proposal.start)]];
      if (!plan && cal.end && (proposal.end !== base.end || proposal.start !== base.start)) values.push([cal.end.id, proposal.end > proposal.start || !base.marker ? calIso(proposal.end) : null]);
      if (!plan) values.push(...this.calResourceValues(event, proposal.resource));
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
      const event = this.calEvents.find(item => item.key === id && !item.base?.external);
      return event ? JSON.parse(JSON.stringify(event.base.row)) : found;
    };
    DataGrid.prototype.editRecord._calendar = true;
  }
