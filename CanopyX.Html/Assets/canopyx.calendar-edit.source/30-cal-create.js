  // ---------- calendar: creating events ----------
  // With create on, clicking an empty slot or day, dragging over slots (or days), Enter on an empty slot or day, N on any slot
  // or day, or "New event here" in the context menu proposes a new event: a slot's event lasts create.minutes, a dragged range
  // covers its slots, a day in the month or the all-day row is an all-day event when the calendar has an allDay column. The
  // cancelable canopyx:eventCreate (and onCreate) comes first with { start, end, allDay, resource }: a host that cancels it opens
  // its own form. Otherwise a small form asks for the title; Add inserts the record through the editing contract (insertRow:
  // validation, undo, and with commit "auto" the writer), Cancel or Escape drops it.
  Object.assign(DataGrid.prototype, {
    /** The proposal for a slot or day cell (and the cell a range ends on): start, end, all-day and resource. */
    calCreateProposal(cell, last) {
      const cal = this.cal, zone = this.calZone, day = Number(cell.dataset.cxDay), resource = this.calCellResource(cell);
      if (cell.dataset.cxMinutes !== undefined) {
        const from = Number(cell.dataset.cxMinutes), to = last?.dataset.cxMinutes !== undefined ? Number(last.dataset.cxMinutes) : from;
        const first = Math.min(from, to), end = last ? Math.max(from, to) + cal.slotMinutes : first + cal.create.minutes;
        return { start: zone.instant(day, first), end: zone.instant(day, Math.min(end, 1440)), allDay: false, resource };
      }
      const other = last ? Number(last.dataset.cxDay) : day, a = Math.min(day, other), b = Math.max(day, other);
      if (cal.create.allDay) return { start: a * CAL_DAY, end: (b + 1) * CAL_DAY, allDay: true, resource };
      // Without all-day events a day gets a timed event at the start of working hours (or 09:00).
      const at = cal.working?.start ?? 540;
      return { start: zone.instant(a, at), end: zone.instant(b, at + cal.create.minutes), allDay: false, resource };
    },
    /** The problem with creating at a proposal, or null: the valid range and unavailable time. */
    calCreateProblem(proposal) {
      const labels = this.calLabels;
      if (!this.calAllowsSpan(proposal.start, proposal.end, proposal.allDay)) return labels.calendarOutsideRange;
      for (const range of this.calRanges) if (range.kind === "unavailable" && (range.resource == null || range.resource === proposal.resource) && calOverlaps(proposal.start, proposal.end, range.start, range.end)) return labels.calendarUnavailable;
      return null;
    },
    /** Starts creating at a proposal: the event, then the host or the inline form. */
    async calCreate(proposal, anchor) {
      if (!this.cal.create || this.editReadOnly) return false;
      const problem = this.calCreateProblem(proposal);
      if (problem) { this.calAnnounce(problem); this.calNotice(problem, true, true); return false; }
      const detail = { start: calIso(proposal.start), end: calIso(proposal.end), allDay: proposal.allDay, resource: proposal.resource };
      let go = this.emit("eventCreate", detail);
      if (go && typeof this.opts.onCreate === "function") { try { go = this.opts.onCreate(gridFreezeCopy(detail)) !== false; } catch (error) { this.emit("error", { error }); go = false; } }
      if (!go) return false;
      this.calCreateForm(proposal, anchor);
      return true;
    },
    /** The small form that names a new event: a title field, Add and Cancel. */
    calCreateForm(proposal, anchor) {
      this.calCloseCreate(false);
      const labels = this.calLabels, panel = this.calCreating = h("form", "cx-cal-create"), titleId = this.id + "-cal-new";
      const heading = h("h3", "cx-cal-create-h"), when = h("p", "cx-cal-det-when"), label = h("label", "cx-cal-create-l"), input = h("input", "cx-input cx-cal-create-input");
      const add = h("button", "cx-btn cx-cal-create-add"), cancel = h("button", "cx-btn ghost cx-cal-create-cancel"), actions = h("div", "cx-cal-create-actions");
      add.dataset.variant = "primary";
      panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false"); panel.setAttribute("aria-labelledby", titleId);
      heading.id = titleId; setText(heading, labels.calendarNewEvent);
      setText(when, this.calTimeText({ start: proposal.start, end: proposal.end, allDay: proposal.allDay, sd: proposal.allDay ? Math.floor(proposal.start / CAL_DAY) : this.calZone.day(proposal.start),
        ed: proposal.allDay ? Math.floor((proposal.end - 1) / CAL_DAY) : this.calZone.day(Math.max(proposal.start, proposal.end - 1)), marker: false }));
      input.id = titleId + "-title"; input.type = "text"; input.maxLength = 1000; input.autocomplete = "off"; label.htmlFor = input.id; setText(label, labels.calendarEventTitle);
      add.type = "submit"; setText(add, labels.calendarCreate); cancel.type = "button"; setText(cancel, labels.calendarCancel);
      actions.append(cancel, add); panel.append(heading, when, label, input, actions);
      panel._calAnchor = anchor;
      this.calPlace(panel, anchor || this.calBody);
      cancel.addEventListener("click", () => this.calCloseCreate(true));
      panel.addEventListener("keydown", key => { if (key.key === "Escape") { key.preventDefault(); key.stopPropagation(); this.calCloseCreate(true); } });
      panel.addEventListener("submit", submit => {
        submit.preventDefault();
        const title = input.value.trim();
        if (!title) { input.focus(); return; }
        // Focus goes back to the slot or day, where the new event shows.
        this.calCloseCreate(true);
        this.calInsertEvent(proposal, title).catch(error => this.emit("error", { error }));
      });
      this.calCreateOutside = press => { if (!panel.contains(press.target)) this.calCloseCreate(false); };
      document.addEventListener("pointerdown", this.calCreateOutside, true);
      input.focus({ preventScroll: true });
    },
    calCloseCreate(restore) {
      const panel = this.calCreating;
      if (!panel) return;
      this.calCreating = null; document.removeEventListener("pointerdown", this.calCreateOutside, true);
      panel.remove();
      if (restore && panel._calAnchor?.isConnected) panel._calAnchor.focus({ preventScroll: true });
    },
    /** Inserts a new event record with its title and times (and its resource), then commits it unless commit is manual. */
    async calInsertEvent(proposal, title, extra) {
      const cal = this.cal, cells = { [cal.title.id]: title, [cal.start.id]: calIso(proposal.start), ...extra };
      if (cal.end) cells[cal.end.id] = calIso(proposal.end);
      if (cal.allDay?.editable && proposal.allDay) cells[cal.allDay.id] = true;
      if (cal.resource?.editable && proposal.resource != null) cells[cal.resource.id] = proposal.resource;
      else if (!cal.resource && cal.resourceIds?.editable && proposal.resource != null) cells[cal.resourceIds.id] = JSON.stringify([proposal.resource]);
      await this.loadEditing();
      const result = await this.insertRow({ cells });
      if (!result.applied) return false;
      const time = this.calFmt.shortDay(proposal.allDay ? Math.floor(proposal.start / CAL_DAY) : this.calZone.day(proposal.start)) + (proposal.allDay ? "" : " " + this.calFmt.time(proposal.start));
      this.calAnnounce(fill(this.calLabels.calendarCreated, { title, time }));
      this.calVersion++;
      if (!result.valid) { this.calInvalidInsert(result); return true; }
      if ((cal.editable?.commit ?? "auto") === "manual") { this.calReload({ keep: true }); return true; }
      return this.calCommit([result.id], title);
    },

    /** A click on an empty slot or day (core calendar hook). */
    calCreateFromClick(cell) { return this.calCreate(this.calCreateProposal(cell), cell); },
    /** Enter on an empty slot or day, or N on any (core calendar hook); true when it handled the key. */
    calCreateFromKey(event, cell) {
      if (!this.cal.create || !cell || this.calMoving) return false;
      const empty = !cell.querySelector(".cx-cal-ev");
      if (!(event.key === "n" || event.key === "N" || event.key === "Enter" && empty) || event.ctrlKey || event.metaKey || event.altKey) return false;
      event.preventDefault();
      this.calCreate(this.calCreateProposal(cell), cell).catch(error => this.emit("error", { error }));
      return true;
    },

    /** A press on an empty slot or day that travels over others selects a range to create (pointer down, from calDragStart). */
    calRangeStart(pointer) {
      if (!this.cal.create || pointer.button !== 0 || this.editReadOnly) return false;
      const cell = pointer.target.closest?.("[data-cx-day]");
      if (!cell || pointer.target.closest(".cx-cal-ev,.cx-cal-more-btn,.cx-cal-num") || cell.classList.contains("cx-cal-invalid")) return false;
      this.calCreateDrag = { first: cell, last: cell, id: pointer.pointerId, x: pointer.clientX, y: pointer.clientY, started: false, selection: this.calSelection };
      return true;
    },
    calRangeMove(pointer) {
      const range = this.calCreateDrag;
      if (!range || pointer.pointerId !== range.id) return false;
      if (range.cancelled) { pointer.preventDefault(); return true; }
      if (!range.started && Math.hypot(pointer.clientX - range.x, pointer.clientY - range.y) < 6) return true;
      range.started = true;
      const cell = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest?.("[data-cx-day]");
      // A range of slots stays in its column; a range of days stays in its view.
      if (cell && this.calBody.contains(cell) && (range.first.dataset.cxMinutes === undefined) === (cell.dataset.cxMinutes === undefined) &&
          (cell.dataset.cxMinutes === undefined || cell.dataset.cxDay === range.first.dataset.cxDay && cell.dataset.cxResource === range.first.dataset.cxResource)) {
        range.last = cell;
        const proposal = this.calCreateProposal(range.first, cell);
        if (cell.dataset.cxMinutes !== undefined) this.calSelectSlotsQuiet(Number(cell.dataset.cxDay), proposal, cell.dataset.cxResource);
        else this.calSelectDaysQuiet(Math.min(Number(range.first.dataset.cxDay), Number(cell.dataset.cxDay)), Math.max(Number(range.first.dataset.cxDay), Number(cell.dataset.cxDay)), this.calCellResource(range.first));
      }
      pointer.preventDefault();
      return true;
    },
    calRangeEnd(pointer, cancel) {
      const range = this.calCreateDrag;
      if (!range || pointer && pointer.pointerId !== range.id) return false;
      if (cancel) this.calCancelGesture();
      this.calCreateDrag = null;
      if (!range.started && !range.cancelled) return true;
      this.calSuppressClick = true; setTimeout(() => { this.calSuppressClick = false; }, 0);
      if (cancel || range.cancelled) return true;
      this.calCreate(this.calCreateProposal(range.first, range.last), range.last).catch(error => this.emit("error", { error }));
      return true;
    },
    /** Marks a range while it is dragged, without reporting it to linked views until it is created. */
    calSelectSlotsQuiet(day, proposal, resource) {
      const zone = this.calZone;
      if (!this.calAllowsSpan(proposal.start, proposal.end, proposal.allDay)) return;
      this.calSelection = { first: day, last: day, from: proposal.start, to: proposal.end, fromMinutes: zone.parts(proposal.start).minutes, toMinutes: zone.parts(proposal.end).minutes || 1440, resource: resource ?? null };
      this.calMarkSelection();
    },
    calSelectDaysQuiet(first, last, resource) {
      const zone = this.calZone;
      if (!this.calAllowsSpan(first * CAL_DAY, (last + 1) * CAL_DAY, true)) return;
      this.calSelection = { first, last, from: zone.start(first), to: zone.start(last + 1), resource: resource ?? null };
      this.calMarkSelection();
    }
  });
  const gridFreezeCopy = value => Object.freeze(JSON.parse(JSON.stringify(value)));
