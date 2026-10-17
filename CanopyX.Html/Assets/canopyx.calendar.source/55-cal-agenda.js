  // ---------- calendar: the agenda (a list of the period's events) and the year overview ----------
  // The agenda is an ARIA grid with a row per event, grouped by day: the date, the time (or All day), the event and its status.
  // Rows take focus; Up and Down move, Page Up and Down change the month, Home and End go to the first and last event, Enter
  // opens the record. The year is twelve small month grids with the number of events on each day as a shade and in each day's
  // accessible name; arrow keys walk the days across months, Enter opens the day.
  Object.assign(DataGrid.prototype, {
    calPaintAgenda() {
      const range = this.calRange, fmt = this.calFmt, today = this.calZone.day(Date.now());
      const grid = h("div", "cx-cal-agenda"); grid.setAttribute("role", "grid"); grid.setAttribute("aria-labelledby", this.calTitle.id); grid.setAttribute("aria-readonly", "true");
      let rows = 0;
      if (range.lastDay - range.firstDay > 31) this.calBucketDays(range.firstDay, range.lastDay);
      for (let day = range.firstDay; day <= range.lastDay; day++) {
        if (this.cal.hidden.has(calDow(day))) continue;
        const events = this.calEventsOn(day);
        if (!events.length) continue;
        const group = h("div", "cx-cal-agroup" + (day === today ? " cx-cal-today" : "")); group.setAttribute("role", "rowgroup");
        const heading = h("div", "cx-cal-ahead"); heading.setAttribute("role", "row");
        const headingCell = h("div", "cx-cal-ahead-c"); headingCell.setAttribute("role", "columnheader"); headingCell.setAttribute("aria-colspan", "2");
        const weekday = h("span", "cx-cal-aweekday"), date = h("span", "cx-cal-adate");
        setText(weekday, fmt.weekday(day, "long")); setText(date, fmt.shortDay(day));
        headingCell.append(date, weekday);
        if (day === today) { const mark = h("span", "cx-cal-atoday"); setText(mark, this.calLabels.calendarToday); headingCell.appendChild(mark); headingCell.setAttribute("aria-current", "date"); }
        heading.appendChild(headingCell); group.appendChild(heading);
        for (const event of events) {
          const row = h("div", "cx-cal-arow"); row.setAttribute("role", "row"); row.tabIndex = -1; row.dataset.cxDay = String(day); row.dataset.cxEventRow = event.id;
          const time = h("div", "cx-cal-atime"), title = h("div", "cx-cal-atitle");
          time.setAttribute("role", "gridcell"); title.setAttribute("role", "gridcell");
          setText(time, event.allDay ? this.calLabels.calendarAllDay : event.marker ? fmt.time(event.start) : event.sd < day || event.ed > day ? this.calTimeText(event) : fill(this.calLabels.calendarTimeRange, { start: fmt.time(event.start), end: fmt.time(event.end) }));
          const element = this.calEventElement(event, "item");
          element.querySelector(".cx-cal-ev-time")?.remove();
          title.appendChild(element);
          row.setAttribute("aria-label", fmt.longDay(day) + ", " + this.calEventName(event));
          row.append(time, title);
          group.appendChild(row); rows++;
        }
        grid.appendChild(group);
      }
      if (!rows) { const empty = h("p", "cx-cal-empty"); setText(empty, this.calLabels.calendarNoEvents); this.calBody.replaceChildren(empty); this.calGrid = null; return; }
      this.calBody.replaceChildren(grid);
      this.calGrid = grid;
      if (!this.calFocus?.event) {
        const rowsList = [...grid.querySelectorAll(".cx-cal-arow")], focusDay = this.calFocus?.day ?? this.calDate;
        const row = rowsList.find(item => Number(item.dataset.cxDay) >= focusDay) || rowsList[rowsList.length - 1];
        if (row) this.calFocus = { day: Number(row.dataset.cxDay), minutes: null, event: null, agendaRow: row.dataset.cxEventRow };
      }
    },
    /** Scrolls the agenda so the focused day's events start at the top. */
    calScrollAgenda() {
      const row = this.calFocusTarget(), group = row?.closest?.(".cx-cal-agroup");
      if (group) this.calBody.scrollTop = Math.max(0, group.offsetTop);
    },
    calKeyAgenda(event, target) {
      const row = target.closest(".cx-cal-arow");
      if (!row) return;
      const rows = [...this.calGrid.querySelectorAll(".cx-cal-arow")], at = rows.indexOf(row), key = event.key;
      let next = null;
      if (key === "ArrowDown" || key === "ArrowUp") next = rows[at + (key === "ArrowDown" ? 1 : -1)];
      else if (key === "Home") next = rows[0];
      else if (key === "End") next = rows[rows.length - 1];
      else if (key === "PageUp" || key === "PageDown") { event.preventDefault(); this.calendarStep(key === "PageUp" ? -1 : 1).then(() => this.calRestoreFocus(true)); return; }
      else if (key === "Enter" || key === " ") { event.preventDefault(); const element = row.querySelector(".cx-cal-ev"); this.calOpenEvent(element._calEvent, true, row).catch(error => this.emit("error", { error })); return; }
      if (!next) return;
      event.preventDefault(); row.tabIndex = -1; next.tabIndex = 0; next.focus();
      this.calFocus = { day: Number(next.dataset.cxDay), minutes: null, event: null, agendaRow: next.dataset.cxEventRow };
    },

    calPaintYear() {
      const range = this.calRange, fmt = this.calFmt, today = this.calZone.day(Date.now()), counts = new Map();
      for (const event of this.calEvents) if (!event.background) for (let day = Math.max(event.sd, range.firstDay); day <= Math.min(event.ed, range.lastDay); day++) counts.set(day, (counts.get(day) || 0) + 1);
      const most = Math.max(1, ...counts.values()), year = h("div", "cx-cal-year");
      for (let month = 0; month < 12; month++) {
        const first = calAddMonths(range.firstDay, month), last = calAddMonths(first, 1) - 1, box = h("section", "cx-cal-ymonth");
        const title = h("h3", "cx-cal-ymonth-h"); title.id = this.id + "-cal-y" + month; setText(title, fmt.monthName(first)); box.appendChild(title);
        const grid = h("div", "cx-cal-ygrid"); grid.setAttribute("role", "grid"); grid.setAttribute("aria-labelledby", title.id); grid.setAttribute("aria-readonly", "true");
        grid.style.setProperty("--cx-cal-cols", String(this.calWeekdays().length));
        grid.appendChild(this.calWeekdayRow("cx-cal-ydow"));
        for (let week = calWeekStart(first, this.cal.firstDay); week <= last; week += 7) {
          const row = h("div", "cx-cal-yweek"); row.setAttribute("role", "row");
          for (const dow of this.calWeekdays()) {
            const day = week + (dow - this.cal.firstDay + 7) % 7, cell = h("div", day < first || day > last ? "cx-cal-ypad" : "cx-cal-yday");
            cell.setAttribute("role", "gridcell");
            if (day >= first && day <= last) {
              const count = counts.get(day) || 0;
              cell.tabIndex = -1; cell.dataset.cxDay = String(day); setText(cell, fmt.dayNumber(day));
              if (!this.calAllowsSpan(day * CAL_DAY, (day + 1) * CAL_DAY, true)) { cell.classList.add("cx-cal-invalid"); cell.setAttribute("aria-disabled", "true"); }
              if (count) cell.dataset.cxHeat = String(Math.min(4, Math.ceil(count / most * 4)));
              if (day === today) { cell.classList.add("cx-cal-today"); cell.setAttribute("aria-current", "date"); }
              cell.setAttribute("aria-label", this.calDayName(day, count, this.calBackgroundsOn(day)));
              cell.title = fmt.longDay(day) + " · " + calCount(this, this.calLabels.calendarEvents, count);
            }
            row.appendChild(cell);
          }
          grid.appendChild(row);
        }
        box.appendChild(grid);
        if (this.cal.yearEvents) box.appendChild(this.calYearList(first, last));
        year.appendChild(box);
      }
      // A legend for the shading, from one event to the busiest day's count; each day's name already says its own.
      if (!counts.size) { this.calBody.replaceChildren(year); this.calGrid = year; return; }
      const legend = h("div", "cx-cal-ylegend"), low = h("span"), high = h("span");
      legend.setAttribute("aria-hidden", "true");
      setText(low, calCount(this, this.calLabels.calendarEvents, 1)); setText(high, calCount(this, this.calLabels.calendarEvents, most));
      legend.appendChild(low);
      for (let heat = 1; heat <= 4; heat++) { const swatch = h("i", "cx-cal-yswatch"); swatch.dataset.cxHeat = String(heat); legend.appendChild(swatch); }
      legend.appendChild(high);
      this.calBody.replaceChildren(year, legend);
      this.calGrid = year;
    },
    /** yearEvents: a month's events under its grid, a few by start with their day, and how many more there are. */
    calYearList(first, last) {
      const list = h("ul", "cx-cal-ylist"), events = this.calEvents.filter(event => !event.background && event.sd <= last && event.ed >= first).sort((a, b) => a.start - b.start), shown = events.slice(0, 5);
      list.setAttribute("aria-label", this.calFmt.monthName(first) + ", " + calCount(this, this.calLabels.calendarEvents, events.length));
      for (const event of shown) {
        const item = h("li"), day = h("span", "cx-cal-yl-day"), element = this.calEventElement(event, "chip");
        setText(day, this.calFmt.dayNumber(Math.max(event.sd, first))); day.setAttribute("aria-hidden", "true");
        element.tabIndex = 0; item.append(day, element); list.appendChild(item);
      }
      if (events.length > shown.length) {
        const item = h("li", "cx-cal-yl-more"), more = gridButton(fill(this.calLabels.calendarMore, { count: numberFormat(this.lang).format(events.length - shown.length) }), () => {
          if (this.cal.views.includes("month")) this.calGo(first, "month", true); else if (this.cal.views.includes("agenda")) this.calGo(first, "agenda", true);
        });
        more.className = "cx-cal-yl-morebtn"; item.appendChild(more); list.appendChild(item);
      }
      return list;
    },
    calKeyYear(event, cell) {
      const day = Number(cell.dataset.cxDay), key = event.key, range = this.calRange;
      if (!this.calAllowsSpan(day * CAL_DAY, (day + 1) * CAL_DAY, true)) return;
      let next = null;
      if (key === "ArrowLeft" || key === "ArrowRight") next = day + (key === "ArrowLeft" ? -1 : 1);
      else if (key === "ArrowUp" || key === "ArrowDown") next = day + (key === "ArrowUp" ? -7 : 7);
      else if (key === "Home") next = calMonthStart(day);
      else if (key === "End") next = calAddMonths(calMonthStart(day), 1) - 1;
      else if (key === "PageUp" || key === "PageDown") next = calAddMonths(day, key === "PageUp" ? -12 : 12);
      else if (key === "Enter") { event.preventDefault(); if (this.cal.views.includes("day")) this.calGo(day, "day", true).then(() => this.calRestoreFocus(true)); else if (this.cal.views.includes("week")) this.calGo(day, "week", true).then(() => this.calRestoreFocus(true)); return; }
      if (next === null) return;
      event.preventDefault();
      next = this.calClampDay(next);
      if (next < range.firstDay || next > range.lastDay) { this.calGo(next, "year", next).then(() => this.calRestoreFocus(true)); return; }
      this.calFocus = { day: next, minutes: null, event: null };
      this.calRestoreFocus(true);
    }
  });
