  // ---------- calendar shared screens: the Reset button ----------
  // A screen everyone shares drifts: someone pages to next month, opens the agenda or hides a calendar. With reset, a Reset
  // button appears beside the navigation once the calendar differs from its configured defaults (the first view, the period of
  // the configured date or today, the zoom and which sources show) and puts all of them back in one press. resetCalendar()
  // does the same from code, with or without the button.
  const CAL_SCREEN_RESET = { sync: DataGrid.prototype.calSyncBar, toggle: DataGrid.prototype.calToggleSource };

  Object.assign(DataGrid.prototype, {
    calScreenReset() {
      if (!this.cal.reset) return;
      const button = this.calResetButton = gridButton(this.calLabels.calendarReset, () => this.resetCalendar().catch(error => this.emit("error", { error })));
      button.classList.add("cx-btn", "cx-cal-reset"); button.hidden = true;
      this.calTodayButton.parentElement.appendChild(button);
      this.calSyncReset();
    },
    /** The configured defaults: the view the calendar started in (the phone view on a phone), and the configured date or today. */
    calHome() { return { view: this.calHomeView || this.cal.view, day: this.calClampDay(this.cal.date ?? this.calZone.day(Date.now())) }; },
    /** The date Reset goes to: the home day, the start of its fitted run, or the next shown day in the day views. */
    calHomeDate(home) {
      const view = home.view, date = this.calFitStart?.(view, home.day) ?? home.day;
      return view === "day" || view === "days" ? this.calShownDay(date, 1) : date;
    },
    calResetNeeded() {
      const home = this.calHome(), range = this.calRange, hidden = this.calHiddenSources, start = this.calHomeSources;
      if (!range) return false;
      // The period Reset would show, not only whether the home day is drawn: a month grid also draws the last days of the month before.
      const homeRange = this.calView === home.view ? this.calRangeOf(home.view, this.calHomeDate(home)) : null;
      return !homeRange || homeRange.firstDay !== range.firstDay || homeRange.lastDay !== range.lastDay || this.calZoom !== this.cal.zoom ||
        hidden.size !== start.size || [...hidden].some(id => !start.has(id));
    },
    calSyncReset() {
      const button = this.calResetButton;
      if (!button) return;
      const needed = this.calResetNeeded();
      if (!needed && document.activeElement === button) this.calTodayButton.focus();
      button.hidden = !needed;
    },
    calSyncBar(announce) { CAL_SCREEN_RESET.sync.call(this, announce); this.calSyncReset(); },
    calToggleSource(id, show) { const visible = CAL_SCREEN_RESET.toggle.call(this, id, show); this.calSyncReset(); return visible; },
    /** Puts back the configured view, date, zoom and sources. */
    async resetCalendar() {
      const home = this.calHome(), start = this.calHomeSources || new Set(this.cal.sources.filter(source => source.hidden).map(source => source.id));
      for (const source of this.cal.sources) if (this.calHiddenSources.has(source.id) !== start.has(source.id)) this.calToggleSource(source.id, !start.has(source.id));
      this.calZoom = this.cal.zoom;
      return this.calGo(this.calHomeDate(home), home.view, home.day);
    }
  });
