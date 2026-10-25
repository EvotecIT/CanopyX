  // ---------- calendar: the simple layouts (docs/calendar.md#views) ----------
  // The mini month is a small month like a date picker: dots for days with events, and selecting a day reports it (a linked
  // grid filters to it; a host can move another calendar there). The week and day lists show each day's events as a list
  // without a time axis. Stacked months show several months one under the other in a scrolling column. All of them are day
  // grids: their cells are days, with the month's keyboard, selection and drag.
  const CAL_DAY_GRIDS = ["month", "mini", "months", "weekList", "dayList"];
  /** Whether a view is a grid of days (the month and its relatives) rather than a time grid, an agenda, a year or a timeline. */
  function calDayGrid(view) { return CAL_DAY_GRIDS.includes(view); }

  Object.assign(DataGrid.prototype, {
    calPaintMini() {
      const range = this.calRange;
      this.calCells = new Map();
      const grid = this.calMonthGrid(range.firstDay, range.lastDay, range.month, { rowHeight: 34, dots: true, outside: this.cal.outsideDays, labelledBy: this.calTitle.id, className: "cx-cal-mini" });
      grid.setAttribute("data-cx-finish-allow", "empty-band");
      this.calBody.replaceChildren(grid);
      this.calGrid = grid;
    },
    calPaintMonths() {
      const range = this.calRange, stack = h("div", "cx-cal-months");
      this.calCells = new Map();
      for (let month = range.month; month <= range.lastDay; month = calAddMonths(month, 1)) {
        const section = h("section", "cx-cal-mblock"), title = h("h3", "cx-cal-mtitle"), last = calAddMonths(month, 1) - 1;
        title.id = this.id + "-cal-m" + month; setText(title, this.calFmt.monthTitle(month));
        const first = calWeekStart(month, this.cal.firstDay), end = calWeekStart(last, this.cal.firstDay) + 6;
        // Days of the months around are left out, so each day has one cell in the column.
        section.append(title, this.calMonthGrid(first, end, month, { rowHeight: 92, dots: this.calPhone, outside: false, labelledBy: title.id }));
        stack.appendChild(section);
      }
      this.calBody.replaceChildren(stack);
      this.calGrid = stack;
    },
    /** The week or day list: one cell per shown day with its events as a list, all-day first, then by start. */
    calPaintList() {
      const range = this.calRange, days = this.calShownDays(range.firstDay, range.lastDay), today = this.calZone.day(Date.now()), valid = this.cal.validRange, fmt = this.calFmt;
      const grid = h("div", "cx-cal-list" + (days.length === 1 ? " cx-cal-list-day" : "")), row = h("div", "cx-cal-lrow");
      grid.setAttribute("role", "grid"); grid.setAttribute("aria-labelledby", this.calTitle.id); grid.setAttribute("aria-readonly", String(!this.cal.editable && !this.cal.create));
      row.setAttribute("role", "row"); grid.style.setProperty("--cx-cal-cols", String(days.length));
      this.calCells = new Map();
      for (const day of days) {
        const events = this.calEventsOn(day), invalid = valid && (day < valid.first || day > valid.last);
        const cell = h("div", "cx-cal-day cx-cal-lday" + (day === today ? " cx-cal-today" : "") + (invalid ? " cx-cal-invalid" : ""));
        cell.setAttribute("role", "gridcell"); cell.tabIndex = -1; cell.dataset.cxDay = String(day);
        if (invalid) cell.setAttribute("aria-disabled", "true");
        if (day === today) cell.setAttribute("aria-current", "date");
        cell.setAttribute("aria-label", this.calDayName(day, events.length, this.calBackgroundsOn(day)));
        const head = h("div", "cx-cal-lhead"), name = h("span", "cx-cal-dayname"), number = h("span", "cx-cal-num");
        head.setAttribute("aria-hidden", "true");
        setText(name, fmt.weekday(day, days.length === 1 ? "long" : "short")); setText(number, fmt.dayNumber(day));
        head.append(name, number);
        if (this.cal.weekNumbers && day === days[0]) { const wk = h("span", "cx-cal-wknum"); setText(wk, fill(this.calLabels.calendarWeekShort, { number: this.calWeekNumber(day) })); head.appendChild(wk); }
        cell.appendChild(head);
        if (!events.length) { const empty = h("p", "cx-cal-empty"); setText(empty, this.calLabels.calendarNoEvents); empty.setAttribute("aria-hidden", "true"); cell.appendChild(empty); }
        for (const event of events) cell.appendChild(this.calEventElement(event, "item"));
        const backgrounds = this.calBackgroundsOn(day);
        if (backgrounds.length) { cell.classList.add("cx-cal-bgday"); cell.style.setProperty("--cx-bg-tone", toneVariable(backgrounds[0].tone, false, "var(--hfx-color-status-info-fg)")); }
        this.calCells.set(day, cell); row.appendChild(cell);
      }
      grid.appendChild(row);
      this.calBody.replaceChildren(grid);
      this.calGrid = grid;
    }
  });
