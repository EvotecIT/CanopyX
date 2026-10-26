  // ---------- calendar: painting, roving focus, keys, clicks and selecting days ----------
  // Every view is one ARIA grid with a single tab stop: the focused day, slot or event has tabindex 0 and the rest -1, and a
  // repaint (new data, a resize, live changes) puts focus back on the same day, slot or event. Keys follow each view's grid
  // (arrows, Page Up and Down for the period, Home and End); Enter goes into a day or opens an event, Escape comes back out.
  // Selecting a day or a range of slots reports canopyx:linkchange with the range, so another view can follow it.
  Object.assign(DataGrid.prototype, {
    calPaint(options = {}) {
      if (!this.calBody || this.destroyed) return;
      this.calDisposeEventRenderers();
      // Focus in the body comes back after the repaint; focus in the bar, the legend, a popover or a menu stays where it is.
      const independent = document.activeElement?.closest(".cx-cal-rpick");
      const resourceControl = independent && this.calBody.contains(independent) ? document.activeElement.classList.contains("cx-cal-rpick-prev") ? ".cx-cal-rpick-prev" : document.activeElement.classList.contains("cx-cal-rpick-next") ? ".cx-cal-rpick-next" : ".cx-cal-rpick-select" : null;
      const owned = (this.calBody.contains(document.activeElement) && !this.calMore && !independent) || !!this.calMenu?.contains(document.activeElement);
      this.calMenuBinding?.close("render", false, true);
      this.calCloseMore(false); this.calHideHover();
      const scroll = options.keep ? this.calScrollState?.() : null;
      const view = this.calView;
      this.host.setAttribute("data-cx-calendar-view", view);
      if (view === "month") this.calPaintMonth();
      else if (view === "mini") this.calPaintMini();
      else if (view === "months") this.calPaintMonths();
      else if (view === "weekList" || view === "dayList") this.calPaintList();
      else if (view === "week" || view === "day" || view === "days") this.calPaintTime();
      else if (view === "agenda") this.calPaintAgenda();
      else if (view === "year") this.calPaintYear();
      else this.calPaintTimeline(options);
      const restored = scroll && !options.resize && this.calRestoreScroll(scroll);
      if (!restored && view === "agenda") this.calScrollAgenda();
      this.calMarkSelection();
      this.calRestoreFocus(owned);
      if (resourceControl) { const target = this.calBody.querySelector(resourceControl); (target?.disabled ? this.calBody.querySelector(".cx-cal-rpick-select") : target)?.focus({ preventScroll: true }); }
    },

    /** Finds the focused drawing of an event, preserving its assignment and day/segment when several are mounted. */
    calEventTarget(id, preferred) {
      const anchor = preferred?.closest?.(".cx-cal-ev");
      if (anchor?.dataset.cxEvent === id && this.calBody.contains(anchor)) return anchor;
      const elements = [...this.calBody.querySelectorAll('[data-cx-event="' + CSS.escape(id) + '"]')], focus = this.calFocus;
      const assignments = focus?.event === id && focus.resource != null ? elements.filter(element => element._calEvent?.resource === focus.resource) : elements;
      return assignments.find(element => Number(element.closest("[data-cx-day]")?.dataset.cxDay) === focus?.day) || assignments[0] || elements[0] || null;
    },
    /** The element that holds focus for the current focus state: an event, a slot, a day or the first cell. */
    calFocusTarget() {
      const focus = this.calFocus, body = this.calBody;
      if (focus?.event) { const element = this.calEventTarget(focus.event); if (element) return element; }
      if (focus?.unit != null && focus.resource != null) { const element = body.querySelector('.cx-tl-cell[data-cx-unit="' + focus.unit + '"][data-cx-resource="' + CSS.escape(focus.resource) + '"]'); if (element) return element; }
      // A zoom change leaves the unit stale: the resource's cell of the focused day, else of any day, keeps the tab stop.
      if (focus?.resource != null && this.calView === "timeline" && this.tlAxis) {
        const unit = this.tlAxis.units.findIndex(item => item.first <= focus.day && focus.day <= item.last);
        const element = body.querySelector('.cx-tl-cell[data-cx-unit="' + Math.max(0, unit) + '"][data-cx-resource="' + CSS.escape(focus.resource) + '"]'); if (element) return element;
      }
      if (focus?.agendaRow) { const element = body.querySelector('[data-cx-event-row="' + CSS.escape(focus.agendaRow) + '"]'); if (element) return element; }
      const resource = focus?.resource != null ? '[data-cx-resource="' + CSS.escape(focus.resource) + '"]' : "";
      if (focus && focus.minutes != null) { const slot = body.querySelector('.cx-cal-slot[data-cx-day="' + focus.day + '"][data-cx-minutes="' + focus.minutes + '"]' + resource); if (slot) return slot; }
      if (focus && focus.minutes == null) { const cell = body.querySelector('.cx-cal-allcell[data-cx-day="' + focus.day + '"]' + resource); if (cell) return cell; }
      if (focus) { const day = body.querySelector('.cx-cal-day[data-cx-day="' + focus.day + '"],.cx-cal-yday[data-cx-day="' + focus.day + '"],[data-cx-day="' + focus.day + '"][data-cx-minutes],.cx-cal-arow[data-cx-day="' + focus.day + '"]');
        if (day) return day; }
      return body.querySelector('.cx-cal-day:not(.cx-cal-out):not(.cx-cal-invalid),.cx-cal-yday:not(.cx-cal-invalid),[data-cx-minutes]:not(.cx-cal-invalid),.cx-cal-arow,.cx-tl-cell:not(.cx-cal-invalid)') || null;
    },
    /** Gives the focus target the tab stop, and DOM focus when the calendar held it (or force). */
    calRestoreFocus(force) {
      const target = this.calFocusTarget();
      // The year's event lists and the independent resource scrollbar keep their own tab stops.
      for (const element of this.calBody.querySelectorAll('[tabindex="0"]')) if (element !== target && !element.closest(".cx-cal-ylist,.cx-cal-rpick")) element.tabIndex = -1;
      if (!target) return;
      target.tabIndex = 0;
      if (force) target.focus({ preventScroll: false });
    },
    calFocusIn(event) {
      const element = event.target, eventElement = element.closest(".cx-cal-ev"), cell = element.closest("[data-cx-day]");
      // Controls in the body (the phone's resource picker, the year's event lists) keep the grid's tab stop where it is.
      if (!eventElement && !cell || element.closest(".cx-cal-ylist")) return;
      if (eventElement?._calEvent) this.calFocus = { day: cell ? Number(cell.dataset.cxDay) : eventElement._calEvent.sd, minutes: null, event: eventElement._calEvent.id, resource: eventElement._calEvent.resource };
      else if (cell) this.calFocus = { day: Number(cell.dataset.cxDay), minutes: cell.dataset.cxMinutes !== undefined ? Number(cell.dataset.cxMinutes) : null, event: null, resource: cell.dataset.cxResource, agendaRow: cell.dataset.cxEventRow, unit: cell.dataset.cxUnit !== undefined ? Number(cell.dataset.cxUnit) : null };
      for (const other of this.calBody.querySelectorAll('[tabindex="0"]')) if (other !== element && !other.closest(".cx-cal-ylist,.cx-cal-rpick")) other.tabIndex = -1;
      if (element.tabIndex < 0 && (eventElement || cell)) element.tabIndex = 0;
    },

    calKey(event) {
      if (event.defaultPrevented || event.altKey && !this.calMoving) return;
      // Right to left, Left goes forward in time and Right back: every handler below reads the swapped key.
      if (this.calRtl && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        const real = event, key = event.key === "ArrowLeft" ? "ArrowRight" : "ArrowLeft";
        event = new Proxy(real, { get: (target, name) => name === "key" ? key : typeof target[name] === "function" ? target[name].bind(target) : target[name] });
      }
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
      const view = this.calView, dayCell = !eventElement && !more && target.closest("[data-cx-day]");
      if (this.cal.drop && dayCell && this.calDropFromKey?.(event, dayCell)) return;
      if (this.cal.create && dayCell && this.calCreateFromKey?.(event, dayCell)) return;
      if (calDayGrid(view) && (eventElement || more) && this.calKeyInDay(event, eventElement || more)) return;
      if (calDayGrid(view)) { const cell = target.closest(".cx-cal-day"); if (cell) this.calKeyMonth(event, cell); return; }
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
      // Days outside the valid range take no clicks: no selection, no day link, no new event.
      if (target.closest(".cx-cal-invalid")) return;
      const number = target.closest(".cx-cal-num,.cx-cal-dayhead,.cx-cal-yday");
      if (number && this.cal.navLinks && this.cal.views.includes("day") && !this.calPhone && this.calView !== "mini" && target.closest(".cx-cal-num,.cx-cal-dayhead")) {
        const day = Number(number.closest("[data-cx-day]")?.dataset.cxDay ?? number.dataset.cxDay);
        if (Number.isFinite(day)) { this.calGo(day, "day", true); return; }
      }
      const cell = target.closest("[data-cx-day]");
      if (!cell) return;
      const day = Number(cell.dataset.cxDay);
      if (!this.calAllowsSpan(day * CAL_DAY, (day + 1) * CAL_DAY, true)) return;
      if (this.calView === "year") { if (this.cal.views.includes("day")) this.calGo(day, "day", true); else this.calFocusDay(day); return; }
      if (cell.dataset.cxMinutes !== undefined) { const minutes = Number(cell.dataset.cxMinutes); this.calSelectSlots(day, minutes, minutes + this.cal.slotMinutes, cell.dataset.cxResource); }
      else this.calSelectDays(day, day, this.calCellResource(cell));
      if (this.calPhone && this.calView === "month" || this.calView === "mini") this.calFocusDay(day);
      // With create on, a click on an empty slot or day proposes an event there (not on a phone's month of dots or the mini month).
      else if (this.cal.create && !cell.classList.contains("cx-cal-invalid")) this.calCreateFromClick?.(cell)?.catch?.(error => this.emit("error", { error }));
    },

    /** A cell's resource: none in a timeline without resources, whose rows are only lanes of packed events. */
    calCellResource(cell) { return this.tlSolo && cell.classList.contains("cx-tl-cell") ? null : cell.dataset.cxResource ?? null; },
    /** Selects whole days (a click, Space or Enter on an empty day) and reports the range. */
    calSelectDays(first, last, resource) {
      const zone = this.calZone;
      if (!this.calAllowsSpan(first * CAL_DAY, (last + 1) * CAL_DAY, true)) return false;
      this.calSelection = { first, last, from: zone.start(first), to: zone.start(last + 1), resource: resource ?? null };
      this.calReportSelection(this.calFmt.dayRange(first, last));
    },
    /** Selects slots of a day (from and to in minutes since midnight). */
    calSelectSlots(day, fromMinutes, toMinutes, resource) {
      const zone = this.calZone, from = zone.instant(day, fromMinutes), to = zone.instant(day, toMinutes);
      if (!this.calAllowsSpan(from, to, false)) return false;
      this.calSelection = { first: day, last: day, from, to, fromMinutes, toMinutes, resource: resource ?? null };
      this.calReportSelection(this.calFmt.longDay(day) + " " + fill(this.calLabels.calendarTimeRange, { start: this.calFmt.time(from), end: this.calFmt.time(to) }));
    },
    calReportSelection(label) {
      const selection = this.calSelection, events = this.calEvents.filter(event => {
        const span = this.calDisplaySpan(event);
        return !event.background && calOverlaps(span.start, span.end, selection.from, selection.to) && (selection.resource == null || this.calHasResource(event, selection.resource));
      });
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
      const keys = [...new Set(events.filter(event => !event.base?.external).map(event => event.key))].slice(0, 10000), values = Object.create(null);
      if (selection?.resource != null && this.cal.resource) values[this.cal.resource.id] = [selection.resource];
      this.emit("linkchange", { view: this.view.id, action, scope: "select", keys, values, label,
        range: selection ? { column: this.cal.start.id, from: calIso(selection.from), to: calIso(selection.to) } : null });
    }
  });
