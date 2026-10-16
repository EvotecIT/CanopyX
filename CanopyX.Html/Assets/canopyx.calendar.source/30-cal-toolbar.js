  // ---------- calendar: the navigation bar (previous, today, next, the range title, go to date, views and zoom) ----------
  // The bar sits above the calendar, under the grid's own toolbar (search, filters, saved views, export), which keeps working
  // for the records the calendar shows. The title names the visible range; a polite live region announces each change of
  // view or range. On phones the view buttons become a select and the title shortens.
  const CAL_ICONS = { previous: "M10 3 5 8l5 5", next: "m6 3 5 5-5 5", calendar: "M3 4h10v9H3zM3 7h10M6 2v3M10 2v3", repeat: "M3 7a4 4 0 0 1 7-3l1 1M13 9a4 4 0 0 1-7 3l-1-1M11 2v3H8M5 14v-3h3" };
  function calIcon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"), path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.setAttribute("viewBox", "0 0 16 16"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("class", "cx-cal-ico");
    path.setAttribute("d", CAL_ICONS[name]); svg.appendChild(path);
    return svg;
  }

  Object.assign(DataGrid.prototype, {
    calBuildBar() {
      const labels = this.calLabels, bar = this.calBar = h("div", "cx-cal-bar"), nav = h("div", "cx-cal-nav");
      nav.setAttribute("role", "group"); nav.setAttribute("aria-label", this.view.label);
      const button = (text, icon, run, cls) => {
        const item = gridButton(icon ? "" : text, run);
        item.classList.add("cx-btn", "cx-cal-" + cls);
        if (icon) { item.classList.add("icon", "ghost"); item.appendChild(calIcon(icon)); item.setAttribute("aria-label", text); item.title = text; }
        return item;
      };
      this.calPrev = button(labels.calendarPrevious, "previous", () => this.calendarStep(-1), "prev");
      this.calTodayButton = button(labels.calendarToday, null, () => { if (this.calTodayButton.getAttribute("aria-disabled") !== "true") this.calendarToday(); }, "gotoday");
      this.calNextButton = button(labels.calendarNext, "next", () => this.calendarStep(1), "next");
      nav.append(this.calTodayButton, this.calPrev, this.calNextButton);
      this.calTitle = h("h2", "cx-cal-title"); this.calTitle.id = this.id + "-cal-title";
      const jump = this.calJump = h("input", "cx-cal-jump"); jump.type = "date"; jump.setAttribute("aria-label", labels.calendarGoTo); jump.title = labels.calendarGoTo;
      jump.addEventListener("change", () => { const day = calParseDay(jump.value); if (Number.isFinite(day)) this.setCalendarDate(jump.value); });
      const views = this.calViewGroup = h("div", "cx-cal-views"); views.setAttribute("role", "group"); views.setAttribute("aria-label", labels.calendarViews);
      this.calViewButtons = new Map();
      for (const view of this.cal.views) {
        const item = button(this.calViewName(view), null, () => this.setCalendarView(view), "view");
        item.setAttribute("aria-pressed", "false"); item.dataset.cxCalView = view;
        this.calViewButtons.set(view, item); views.appendChild(item);
      }
      const select = this.calViewSelect = h("select", "cx-cal-view-select"); select.setAttribute("aria-label", labels.calendarViews);
      for (const view of this.cal.views) { const option = h("option"); option.value = view; setText(option, this.calViewName(view)); select.appendChild(option); }
      select.addEventListener("change", () => this.setCalendarView(select.value));
      const zoom = this.calZoomSelect = h("select", "cx-cal-zoom"); zoom.setAttribute("aria-label", labels.calendarZoom); zoom.title = labels.calendarZoom;
      for (const level of this.cal.zooms) { const option = h("option"); option.value = level; setText(option, labels["calendarZoom" + level[0].toUpperCase() + level.slice(1)]); zoom.appendChild(option); }
      zoom.addEventListener("change", () => this.setCalendarZoom(zoom.value));
      if (this.cal.views.length < 2) { views.hidden = true; select.hidden = true; }
      bar.append(nav, this.calTitle, h("span", "cx-spacer"), jump, zoom, views, select);
      return bar;
    },

    calViewName(view) {
      const labels = this.calLabels;
      return view === "days" ? fill(labels.calendarDays, { count: this.calDaysCount() }) : labels["calendar" + view[0].toUpperCase() + view.slice(1)];
    },
    calDaysCount() { return this.calPhone && this.cal.days > 3 ? 3 : this.cal.days; },

    /** Writes the bar for the current view and range, and announces a change once it settles. */
    calSyncBar(announce) {
      const view = this.calView, range = this.calRange;
      for (const [name, item] of this.calViewButtons) { item.setAttribute("aria-pressed", String(name === view)); item.classList.toggle("active", name === view); }
      this.calViewSelect.value = view;
      this.calZoomSelect.hidden = view !== "timeline" || this.cal.zooms.length < 2;
      this.calZoomSelect.value = this.calZoom;
      const title = this.calRangeTitle();
      setText(this.calTitle, title);
      this.calJump.value = calDayText(this.calDate);
      const today = this.calZone.day(Date.now());
      // aria-disabled keeps focus on the button when today comes into view (a disabled button would drop it).
      this.calTodayButton.setAttribute("aria-disabled", String(today >= range.firstDay && today <= range.lastDay));
      if (announce) this.calAnnounce(fill(this.calLabels.calendarShowing, { view: this.calViewName(view), range: title }));
    },

    /** The visible range in words: a month and year, a range of days, one long day, a year, or the timeline's span. */
    calRangeTitle() {
      const fmt = this.calFmt, range = this.calRange;
      switch (this.calView) {
        case "month": case "agenda": return fmt.monthTitle(this.calDate);
        case "year": return fmt.year(this.calDate);
        case "day": return this.calPhone ? fmt.shortDay(range.firstDay) + ", " + fmt.year(range.firstDay) : fmt.longDay(range.firstDay);
        case "timeline": return this.calTimelineTitle ? this.calTimelineTitle() : fmt.dayRange(range.firstDay, range.lastDay);
        default: return fmt.dayRange(range.firstDay, range.lastDay);
      }
    },

    calAnnounce(text) {
      clearTimeout(this.calAnnounceTimer);
      // A short delay lets a burst of changes (holding an arrow key) announce once.
      this.calAnnounceTimer = setTimeout(() => { if (!this.destroyed) setText(this.calLive, text); }, 150);
    }
  });
