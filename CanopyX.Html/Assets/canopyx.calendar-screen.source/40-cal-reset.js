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
    calResetNeeded() {
      const home = this.calHome(), range = this.calRange, hidden = this.calHiddenSources, start = this.calHomeSources;
      return !!range && (this.calView !== home.view || home.day < range.firstDay || home.day > range.lastDay || this.calZoom !== this.cal.zoom ||
        hidden.size !== start.size || [...hidden].some(id => !start.has(id)));
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
      const view = home.view, date = this.calFitStart?.(view, home.day) ?? home.day;
      return this.calGo(view === "day" || view === "days" ? this.calShownDay(date, 1) : date, view, home.day);
    }
  });
