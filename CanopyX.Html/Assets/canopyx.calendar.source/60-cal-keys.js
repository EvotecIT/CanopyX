  // ---------- calendar: painting, roving focus, keys, clicks and selecting days ----------
  // Every view is one ARIA grid with a single tab stop: the focused day, slot or event has tabindex 0 and the rest -1, and a
  // repaint (new data, a resize, live changes) puts focus back on the same day, slot or event. Keys follow each view's grid
  // (arrows, Page Up and Down for the period, Home and End); Enter goes into a day or opens an event, Escape comes back out.
  // Selecting a day or a range of slots reports canopyx:linkchange with the range, so another view can follow it.
  Object.assign(DataGrid.prototype, {
    calPaint(options = {}) {
      if (!this.calBody || this.destroyed) return;
      const owned = this.calRoot.contains(document.activeElement) && !this.calMore;
      this.calCloseMore(false);
      const scroll = options.keep ? this.calScrollState?.() : null;
      const view = this.calView;
      this.host.setAttribute("data-cx-calendar-view", view);
      if (view === "month") this.calPaintMonth();
      else if (view === "week" || view === "day" || view === "days") this.calPaintTime();
      else if (view === "agenda") this.calPaintAgenda();
      else if (view === "year") this.calPaintYear();
      else this.calPaintTimeline(options);
      const restored = scroll && !options.resize && this.calRestoreScroll(scroll);
      if (!restored && view === "agenda") this.calScrollAgenda();
      this.calMarkSelection();
      this.calRestoreFocus(owned);
    },

    /** The element that holds focus for the current focus state: an event, a slot, a day or the first cell. */
    calFocusTarget() {
      const focus = this.calFocus, body = this.calBody;
      if (focus?.event) { const element = body.querySelector('[data-cx-event="' + CSS.escape(focus.event) + '"]'); if (element) return element; }
      if (focus?.unit != null && focus.resource != null) { const element = body.querySelector('.cx-tl-cell[data-cx-unit="' + focus.unit + '"][data-cx-resource="' + CSS.escape(focus.resource) + '"]'); if (element) return element; }
      // A zoom change leaves the unit stale: the resource's cell of the focused day, else of any day, keeps the tab stop.
      if (focus?.resource != null && this.calView === "timeline" && this.tlAxis) {
        const unit = this.tlAxis.units.findIndex(item => item.first <= focus.day && focus.day <= item.last);
        const element = body.querySelector('.cx-tl-cell[data-cx-unit="' + Math.max(0, unit) + '"][data-cx-resource="' + CSS.escape(focus.resource) + '"]'); if (element) return element;
      }
      if (focus?.agendaRow) { const element = body.querySelector('[data-cx-event-row="' + CSS.escape(focus.agendaRow) + '"]'); if (element) return element; }
      if (focus && focus.minutes != null) { const slot = body.querySelector('[data-cx-day="' + focus.day + '"][data-cx-minutes="' + focus.minutes + '"]'); if (slot) return slot; }
      if (focus) { const day = body.querySelector('.cx-cal-day[data-cx-day="' + focus.day + '"],.cx-cal-yday[data-cx-day="' + focus.day + '"],[data-cx-day="' + focus.day + '"][data-cx-minutes],.cx-cal-arow[data-cx-day="' + focus.day + '"]');
        if (day) return day; }
      return body.querySelector('.cx-cal-day:not(.cx-cal-out),.cx-cal-yday,[data-cx-minutes],.cx-cal-arow,.cx-tl-cell') || null;
    },
    /** Gives the focus target the tab stop, and DOM focus when the calendar held it (or force). */
    calRestoreFocus(force) {
      const target = this.calFocusTarget();
      for (const element of this.calBody.querySelectorAll('[tabindex="0"]')) if (element !== target) element.tabIndex = -1;
      if (!target) return;
      target.tabIndex = 0;
      if (force) target.focus({ preventScroll: false });
    },
    calFocusIn(event) {
      const element = event.target, eventElement = element.closest(".cx-cal-ev"), cell = element.closest("[data-cx-day]");
      if (eventElement?._calEvent) this.calFocus = { day: eventElement._calEvent.sd, minutes: null, event: eventElement._calEvent.id };
      else if (cell) this.calFocus = { day: Number(cell.dataset.cxDay), minutes: cell.dataset.cxMinutes !== undefined ? Number(cell.dataset.cxMinutes) : null, event: null, resource: cell.dataset.cxResource, agendaRow: cell.dataset.cxEventRow, unit: cell.dataset.cxUnit !== undefined ? Number(cell.dataset.cxUnit) : null };
      for (const other of this.calBody.querySelectorAll('[tabindex="0"]')) if (other !== element) other.tabIndex = -1;
      if (element.tabIndex < 0 && (eventElement || cell)) element.tabIndex = 0;
    },

    calKey(event) {
      if (event.defaultPrevented || event.altKey && !this.calMoving) return;
      if (this.calEditKey?.(event)) return;
      const target = event.target, eventElement = target.closest(".cx-cal-ev"), more = target.closest(".cx-cal-more-btn");
      if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "y" || event.key === "Z")) {
        if (!this.cal.editable) return;
        event.preventDefault();
        // Undo and redo are edits too: with commit "auto" they are saved as a drop is.
        const done = event.key === "y" || event.shiftKey ? this.redo() : this.undo();
        if (done === true && this.cal.editable.commit === "auto" && this.hasChanges()) this.calCommit(this.getChanges().map(change => change.id), "");
        return;
      }
      if (eventElement && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); this.calOpenEvent(eventElement._calEvent, true, eventElement).catch(error => this.emit("error", { error })); return; }
      if (more && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); this.calOpenMore(Number(more.dataset.cxDay), this.calEventsOn(Number(more.dataset.cxDay)), more); return; }
      const view = this.calView;
      if (view === "month" && (eventElement || more) && this.calKeyInDay(event, eventElement || more)) return;
      if (view === "month") { const cell = target.closest(".cx-cal-day"); if (cell) this.calKeyMonth(event, cell); return; }
      if (view === "week" || view === "day" || view === "days") { this.calKeyTime(event, target, eventElement); return; }
      if (view === "agenda") { this.calKeyAgenda(event, target); return; }
      if (view === "year") { const cell = target.closest(".cx-cal-yday"); if (cell) this.calKeyYear(event, cell); return; }
      this.calKeyTimeline?.(event, target, eventElement);
    },

    calClick(event) {
      if (this.calSuppressClick) { this.calSuppressClick = false; return; }
      const target = event.target, eventElement = target.closest(".cx-cal-ev"), more = target.closest(".cx-cal-more-btn");
      if (eventElement) { this.calOpenEvent(eventElement._calEvent, false, eventElement).catch(error => this.emit("error", { error })); return; }
      if (more) { this.calOpenMore(Number(more.dataset.cxDay), this.calEventsOn(Number(more.dataset.cxDay)), more); return; }
      if (this.calView === "timeline") { this.calTimelineClick?.(event); return; }
      const number = target.closest(".cx-cal-num,.cx-cal-dayhead,.cx-cal-yday");
      if (number && this.cal.views.includes("day") && !this.calPhone && target.closest(".cx-cal-num,.cx-cal-dayhead")) {
        const day = Number(number.closest("[data-cx-day]")?.dataset.cxDay ?? number.dataset.cxDay);
        if (Number.isFinite(day)) { this.calGo(day, "day", true); return; }
      }
      const cell = target.closest("[data-cx-day]");
      if (!cell) return;
      const day = Number(cell.dataset.cxDay);
      if (this.calView === "year") { if (this.cal.views.includes("day")) this.calGo(day, "day", true); else this.calFocusDay(day); return; }
      if (cell.dataset.cxMinutes !== undefined) { const minutes = Number(cell.dataset.cxMinutes); this.calSelectSlots(day, minutes, minutes + this.cal.slotMinutes, cell.dataset.cxResource); }
      else this.calSelectDays(day, day);
      if (this.calPhone && this.calView === "month") this.calFocusDay(day);
    },

    /** Selects whole days (a click, Space or Enter on an empty day) and reports the range. */
    calSelectDays(first, last, resource) {
      const zone = this.calZone;
      this.calSelection = { first, last, from: zone.start(first), to: zone.start(last + 1), resource: resource ?? null };
      this.calReportSelection(this.calFmt.dayRange(first, last));
    },
    /** Selects slots of a day (from and to in minutes since midnight). */
    calSelectSlots(day, fromMinutes, toMinutes, resource) {
      const zone = this.calZone, from = zone.instant(day, fromMinutes), to = zone.instant(day, toMinutes);
      this.calSelection = { first: day, last: day, from, to, fromMinutes, toMinutes, resource: resource ?? null };
      this.calReportSelection(this.calFmt.longDay(day) + " " + fill(this.calLabels.calendarTimeRange, { start: this.calFmt.time(from), end: this.calFmt.time(to) }));
    },
    calReportSelection(label) {
      const selection = this.calSelection, events = this.calEvents.filter(event => !event.background && calOverlaps(event.start, event.end, selection.from, selection.to) &&
        (selection.resource == null || event.resource === selection.resource));
      this.calMarkSelection();
      this.calAnnounce(fill(this.calLabels.calendarSelected, { range: label }));
      this.calEmitLink("select", events, label, selection);
    },
    calMarkSelection() {
      const selection = this.calSelection;
      for (const cell of this.calBody.querySelectorAll('[aria-selected="true"]')) cell.setAttribute("aria-selected", "false");
      if (!selection) return;
      for (const cell of this.calBody.querySelectorAll("[data-cx-day]")) {
        const day = Number(cell.dataset.cxDay), minutes = cell.dataset.cxMinutes;
        const inside = day >= selection.first && day <= selection.last && (minutes === undefined || selection.fromMinutes === undefined || +minutes >= selection.fromMinutes && +minutes < selection.toMinutes) &&
          (selection.resource == null || cell.dataset.cxResource === undefined || cell.dataset.cxResource === selection.resource);
        if (inside) cell.setAttribute("aria-selected", "true");
      }
    },
    clearCalendarSelection() {
      if (!this.calSelection) return;
      this.calSelection = null; this.calMarkSelection(); this.calEmitLink("clear", [], "", null);
    },

    /** canopyx:linkchange from the calendar: keys are the records in the selection, range is its instants on the start column. */
    calEmitLink(action, events, label, selection) {
      if (this.opts.linkEvents !== true && !this.linkWatching) return;
      const keys = [...new Set(events.map(event => event.key))].slice(0, 10000), values = Object.create(null);
      if (selection?.resource != null && this.cal.resource) values[this.cal.resource.id] = [selection.resource];
      this.emit("linkchange", { view: this.view.id, action, scope: "select", keys, values, label,
        range: selection ? { column: this.cal.start.id, from: calIso(selection.from), to: calIso(selection.to) } : null });
    }
  });
