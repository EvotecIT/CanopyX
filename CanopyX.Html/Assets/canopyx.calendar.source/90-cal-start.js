  // ---------- calendar: starting it, the visible range, navigation and its place in the grid state ----------
  // The calendar replaces the grid's table in the host and keeps everything else: the toolbar (search, filters, saved views,
  // export), the query line with its chips, the record drawer, facets, live data and editing all work on the same records.
  // The table stays built but hidden, so a host can still use every grid method. The calendar follows the accepted query
  // (canopyx:query) and live changes (canopyx:rowsChanged), and keeps its view, date, zoom and collapsed resources in the
  // grid state, so saved views and the remembered state bring them back.
  Object.assign(DataGrid.prototype, {
    startCalendar() {
      if (this.cal) return;
      this.cal = calSettings(this);
      this.calVersion = 1; this.calEpoch = 0; this.calRuleErrors = new Set(); this.calEvents = []; this.calRanges = [];
      this.calLabels = calLabelsFor(this.labels);
      this.calZone = calZone(this.cal.zoneName); this.calFmt = calFormats(this.lang, this.calZone);
      // Series expand in one fixed zone for every reader: the calendar's IANA timeZone, else UTC (docs/calendar.md#recurrence).
      this.calSeriesZone = calZone(this.cal.zoneFixed && this.cal.zoneName !== "local" ? this.cal.zoneName : "utc");
      this.calMinSegment = Math.max(15, this.cal.slotMinutes * 0.75);
      this.calView = this.cal.view; this.calZoom = this.cal.zoom;
      this.calDate = this.cal.date ?? this.calZone.day(Date.now());
      this.calCollapsed = new Set();
      this.defaultState.calendar = { view: this.cal.view, date: null, zoom: this.cal.zoom };
      const signal = this.lifetime.signal, host = this.host;
      host.classList.add("cx-calendar");
      host.setAttribute("data-cx-event-style", this.cal.eventStyle);
      const root = this.calRoot = h("div", "cx-cal");
      root.setAttribute("role", "region"); root.setAttribute("aria-label", this.view.label);
      this.calNoticeElement = h("div", "cx-cal-notice"); this.calNoticeElement.hidden = true; this.calNoticeElement.setAttribute("role", "status");
      this.calBody = h("div", "cx-cal-body");
      this.calLive = h("div", "cx-live cx-sr-only"); this.calLive.setAttribute("aria-live", "polite");
      root.append(this.calBuildBar(), this.calNoticeElement, this.calBody, this.calLive);
      this.grid.before(root);
      this.calPhone = host.clientWidth > 0 && host.clientWidth <= 640;
      if (this.calPhone && !this.initialState?.calendar) this.calView = this.cal.phone || (this.cal.views.includes("agenda") ? "agenda" : this.calView);
      this.calBody.addEventListener("keydown", event => this.calKey(event), { signal });
      this.calBody.addEventListener("click", event => this.calClick(event), { signal });
      this.calBody.addEventListener("focusin", event => this.calFocusIn(event), { signal });
      host.addEventListener("canopyx:query", () => { this.calCache?.clear(); this.calReload(); }, { signal });
      host.addEventListener("canopyx:rowsChanged", () => { this.calCache?.clear(); this.calVersion++; this.calReload({ keep: true }); }, { signal });
      host.addEventListener("canopyx:commit", () => { this.calCache?.clear(); this.calVersion++; this.calReload({ keep: true }); }, { signal });
      host.addEventListener("canopyx:cellValueChanged", () => { this.calVersion++; this.calReload({ keep: true }); }, { signal });
      if (this.cal.editable) {
        host.setAttribute("data-cx-calendar-editable", "true");
        this.calBody.addEventListener("pointerdown", event => this.calDragStart(event), { signal });
        this.calBody.addEventListener("pointermove", event => this.calDragMove(event), { signal });
        this.calBody.addEventListener("pointerup", event => this.calDragEnd(event, false), { signal });
        this.calBody.addEventListener("pointercancel", event => this.calDragEnd(event, true), { signal });
        this.calBody.addEventListener("lostpointercapture", event => { if (this.calDrag?.id === event.pointerId && !this.calDrag.started) this.calDrag = null; }, { signal });
      }
      let width = 0, height = 0;
      const observer = new ResizeObserver(() => requestAnimationFrame(() => {
        if (this.destroyed || !root.clientWidth) return;
        this.updateGridPhone();
        const phone = host.clientWidth <= 640, changed = phone !== this.calPhone || Math.abs(root.clientWidth - width) > 1 || Math.abs(this.calBody.clientHeight - height) > 1;
        width = root.clientWidth; height = this.calBody.clientHeight;
        const switched = phone !== this.calPhone;
        if (switched) { this.calPhone = phone; host.classList.toggle("cx-cal-phone", phone); this.calSyncBar(false); }
        if (!changed || !this.calRange) return;
        // Only the month (its rows and "+N more" follow the height) and a phone switch rebuild; other views follow by CSS.
        if (switched || this.calView === "month") this.calPaint({ keep: true, resize: true });
        else if (this.calView === "timeline") this.tlPaintLanes?.();
        else if (this.calScroller?.isConnected) this.calGrid.querySelector(".cx-cal-thead").style.paddingRight = Math.max(0, this.calScroller.offsetWidth - this.calScroller.clientWidth) + "px";
      }));
      observer.observe(root);
      host.classList.toggle("cx-cal-phone", this.calPhone);
      const timer = setInterval(() => { if (!this.destroyed && this.cal.now) this.calTick?.(); }, 60000);
      // Print: the month shows every event, the time grid every hour, and the timeline writes its static copy.
      const print = on => { if (this.destroyed || !this.calRange) return; this.calPrinting = on; host.classList.toggle("cx-cal-printing", on); this.tlPrint?.(on); if (this.calView !== "timeline") this.calPaint({ keep: true, resize: true }); };
      global.addEventListener("beforeprint", () => print(true), { signal }); global.addEventListener("afterprint", () => print(false), { signal });
      signal.addEventListener("abort", () => {
        observer.disconnect(); clearInterval(timer); clearTimeout(this.calAnnounceTimer); this.calPrevLifetime?.abort();
        root.remove(); host.classList.remove("cx-calendar", "cx-cal-phone"); host.removeAttribute("data-cx-event-style"); host.removeAttribute("data-cx-calendar-ready");
      }, { once: true });
      calWrapHighlight();
      // The Export menu offers iCalendar on this grid only, as a format a plugin given to one grid would.
      const plugin = { name: "calendar-export", exportFormats: [this.calExportFormat()] };
      this.plugins = [...this.plugins, plugin]; this.opts = { ...this.opts, plugins: [...this.opts.plugins || [], plugin] };
      this.calRange = this.calRangeOf(this.calView, this.calDate);
      this.calSyncBar(false);
      if (this.cal.resources || this.calView === "timeline") return this.calLoadTimeline();
    },

    /** The first and last day a view shows for a date. */
    calRangeOf(view, date) {
      const cal = this.cal;
      if (view === "month") {
        const month = calMonthStart(date), end = calAddMonths(month, 1) - 1;
        return { firstDay: calWeekStart(month, cal.firstDay), lastDay: calWeekStart(end, cal.firstDay) + 6, month };
      }
      if (view === "week") { const first = calWeekStart(date, cal.firstDay); return { firstDay: first, lastDay: first + 6 }; }
      if (view === "day") return { firstDay: date, lastDay: date };
      if (view === "days") {
        let last = date;
        for (let shown = 0; shown < this.calDaysCount(); last++) if (!cal.hidden.has(calDow(last))) shown++;
        return { firstDay: date, lastDay: last - 1 };
      }
      if (view === "agenda") { const month = calMonthStart(date); return { firstDay: month, lastDay: calAddMonths(month, 1) - 1, month }; }
      if (view === "year") { const parts = calDayParts(date); return { firstDay: calDayNumber(parts.y, 1, 1), lastDay: calDayNumber(parts.y + 1, 1, 1) - 1 }; }
      return this.calTimelineRange(date);
    },
    /** The days of a range the view shows: hidden weekdays left out. */
    calShownDays(first, last) {
      const days = [];
      for (let day = first; day <= last; day++) if (!this.cal.hidden.has(calDow(day))) days.push(day);
      return days;
    },
    /** A visible day at or after (direction 1) or before (-1) a day. */
    calShownDay(day, direction) {
      for (let i = 0; i < 7 && this.cal.hidden.has(calDow(day)); i++) day += direction || 1;
      return day;
    },

    calendarStep(direction) {
      if (direction !== 1 && direction !== -1) throw new Error("CanopyX: calendarStep takes 1 or -1.");
      const date = this.calDate, view = this.calView;
      let next;
      if (view === "month" || view === "agenda") next = calAddMonths(date, direction);
      else if (view === "year") next = calAddMonths(date, 12 * direction);
      else if (view === "week") next = date + 7 * direction;
      else if (view === "day") next = this.calShownDay(date + direction, direction);
      else if (view === "days") { const range = this.calRangeOf("days", date); next = direction > 0 ? range.lastDay + 1 : this.calStepBack(date); }
      else next = this.calTimelineStep(date, direction);
      return this.calGo(next, view);
    },
    calStepBack(date) {
      let day = date;
      for (let shown = 0; shown < this.calDaysCount();) { day--; if (!this.cal.hidden.has(calDow(day))) shown++; }
      return day;
    },
    calendarToday() { return this.calGo(this.calZone.day(Date.now()), this.calView, true); },
    setCalendarDate(date) {
      const day = typeof date === "number" ? date : calParseDay(String(date).slice(0, 10));
      if (!Number.isFinite(day)) throw new Error("CanopyX: a calendar date is yyyy-MM-dd.");
      return this.calGo(day, this.calView, true);
    },
    setCalendarView(view) {
      if (!this.cal.views.includes(view)) throw new Error("CanopyX: the calendar has no view '" + view + "'.");
      const date = this.calFocus?.day ?? this.calDate;
      return this.calGo(view === "day" || view === "days" ? this.calShownDay(date, 1) : date, view, true);
    },
    setCalendarZoom(zoom) {
      if (!this.cal.zooms.includes(zoom)) throw new Error("CanopyX: the calendar has no zoom '" + zoom + "'.");
      this.calZoom = zoom;
      return this.calGo(this.calDate, this.calView, true);
    },
    /** Moves to a date and view. focus: true focuses the date, a day number focuses that day, otherwise the focus steps along. */
    async calGo(date, view, focus) {
      const changed = view !== this.calView || date !== this.calDate, shift = date - this.calDate;
      // Stepping keeps the focused day's place in the period (the same weekday a week later); a jump focuses the date itself.
      const day = typeof focus === "number" ? focus : !focus && this.calFocus && view === this.calView ? this.calFocus.day + shift : date;
      this.calView = view; this.calDate = date;
      this.calFocus = { day, minutes: this.calFocus?.minutes ?? null, event: null, resource: this.calFocus?.resource ?? null };
      if (view === "timeline") await this.calLoadTimeline();
      await this.calReload({ announce: changed, keep: true });
      if (changed) this.stateChanged();
      return this.getCalendar();
    },

    getCalendar() {
      calNeed(this);
      const range = this.calRange || this.calRangeOf(this.calView, this.calDate);
      return gridFreeze({ view: this.calView, date: calDayText(this.calDate), zoom: this.calZoom, from: calDayText(range.firstDay), to: calDayText(range.lastDay),
        timeZone: this.calZone.name, events: this.calEvents.length, collapsed: [...this.calCollapsed] });
    },
    calSnapshot() { return this.getCalendar(); },
    /** The occurrences shown, as plain copies: id, record id, start and end (ISO), all-day, title and resource. */
    getCalendarEvents() {
      return gridFreeze(this.calEvents.map(event => gridFreeze({ id: event.id, record: event.key, start: calIso(event.start), end: calIso(event.end), allDay: event.allDay,
        title: event.title, resource: event.resource, recurring: event.recurring, background: event.background })));
    },

    /**
     * Applies a saved calendar state: { view, date, zoom, collapsed }. A part that no longer fits the definition (a view or zoom it
     * stopped offering, a malformed date or list) falls back to the definition's own, so an old remembered state never fails.
     */
    calApplyState(input) {
      const state = input && typeof input === "object" && !Array.isArray(input) ? input : {};
      const view = this.cal.views.includes(state.view) ? state.view : this.cal.view, zoom = this.cal.zooms.includes(state.zoom) ? state.zoom : this.cal.zoom;
      const saved = typeof state.date === "string" ? calParseDay(state.date) : NaN, date = Number.isFinite(saved) ? saved : this.cal.date ?? this.calZone.day(Date.now());
      const collapsed = Array.isArray(state.collapsed) && state.collapsed.length <= 10000 ? state.collapsed.filter(id => typeof id === "string") : [];
      this.calZoom = zoom; this.calCollapsed = new Set(collapsed);
      this.calApplyCollapsed?.();
      return this.calGo(date, view, true);
    }
  });

  // The calendar's view, date, zoom and collapsed resources travel with the grid state.
  const CAL_STATE = { get: DataGrid.prototype.getState, apply: DataGrid.prototype.applyStatePresentation, zone: DataGrid.prototype.setTimeZone };
  Object.assign(DataGrid.prototype, {
    getState() {
      const state = CAL_STATE.get.call(this);
      if (this.cal) state.calendar = { view: this.calView, date: calDayText(this.calDate), zoom: this.calZoom, ...this.calCollapsed.size ? { collapsed: [...this.calCollapsed] } : {} };
      return state;
    },
    applyStatePresentation(state) {
      const applied = CAL_STATE.apply.call(this, state);
      if (!this.cal || state.calendar === undefined) return applied;
      const calendar = this.calApplyState(state.calendar);
      return Promise.all([applied, calendar]).then(([result]) => result);
    },
    setTimeZone(zone) {
      const result = CAL_STATE.zone.call(this, zone);
      if (this.cal && !this.cal.zoneFixed && this.calZone.name !== (this.local ? "local" : "utc")) {
        this.calZone = calZone(this.local ? "local" : "utc"); this.calFmt = calFormats(this.lang, this.calZone); this.calVersion++;
        this.calReload({ keep: true });
      }
      return result;
    }
  });

  /** The calendar methods need a calendar: a grid without one says so instead of failing deep inside. */
  function calNeed(grid) { if (!grid.cal) throw new Error("CanopyX: this grid has no calendar."); }
  for (const name of ["setCalendarView", "setCalendarDate", "setCalendarZoom", "calendarStep", "calendarToday", "getCalendarEvents", "exportCalendar", "openCalendarEvent", "clearCalendarSelection"]) {
    const method = DataGrid.prototype[name];
    if (method) DataGrid.prototype[name] = function (...args) { calNeed(this); return method.apply(this, args); };
  }
  /** Keeps link highlights painted on calendar events: setHighlight and clearHighlight repaint the marks once they ran. */
  function calWrapHighlight() {
    for (const name of ["setHighlight", "clearHighlight"]) {
      const current = DataGrid.prototype[name];
      if (current._calendar) continue;
      const wrapped = function (...args) {
        const result = current.apply(this, args);
        if (this.cal) Promise.resolve(result).then(() => { calWrapHighlight(); this.calMarkHighlights(); }, () => {});
        return result;
      };
      wrapped._calendar = true; wrapped.linkStub = current.linkStub;
      DataGrid.prototype[name] = wrapped;
    }
  }
