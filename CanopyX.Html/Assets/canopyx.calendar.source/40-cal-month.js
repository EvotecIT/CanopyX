  // ---------- calendar: the month view ----------
  // An ARIA grid: a row of weekday headers, then one row per week with a gridcell per shown day. Events sit in the cell of
  // the day they start in (in that week), positioned over the days they cover: all-day and multi-day events as bars that
  // continue across weeks, timed events as one line with their time. A day that holds more events than fit shows "+N more",
  // which lists them all. eventLimit "auto" fits as many lines as the row height allows. Phones show dots per day and the
  // list of the focused day under the month.
  const CAL_LANE = 22, CAL_NUMBER = 26;

  const calDayOrder = (a, b) => (b.allDay - a.allDay) || a.start - b.start || (a.id < b.id ? -1 : 1);
  Object.assign(DataGrid.prototype, {
    /** The shown weekdays in order, starting at the first weekday. */
    calWeekdays() {
      const days = [];
      for (let i = 0; i < 7; i++) { const dow = (this.cal.firstDay + i) % 7; if (!this.cal.hidden.has(dow)) days.push(dow); }
      return days;
    },
    /** A columnheader row of weekday names; full names are the accessible names. */
    calWeekdayRow(className, corner) {
      const row = h("div", className), fmt = this.calFmt;
      row.setAttribute("role", "row");
      if (corner) { const cell = h("div", "cx-cal-corner"); cell.setAttribute("role", "columnheader"); setText(cell, corner === true ? "" : corner); row.appendChild(cell); }
      // 2023-01-01 was a Sunday: its day number plus a weekday gives that weekday's name.
      for (const dow of this.calWeekdays()) {
        const cell = h("div", "cx-cal-dowc"), day = calDayNumber(2023, 1, 1) + dow;
        cell.setAttribute("role", "columnheader"); cell.setAttribute("aria-label", fmt.weekday(day, "long"));
        setText(cell, fmt.weekday(day, this.calPhone ? "narrow" : "short")); row.appendChild(cell);
      }
      return row;
    },
    /** The accessible name of a day cell: its long date, today, the background ranges on it and its event count. */
    calDayName(day, count, ranges) {
      const parts = [this.calFmt.longDay(day)];
      if (day === this.calZone.day(Date.now())) parts.push(this.calLabels.calendarToday);
      for (const range of ranges || []) parts.push(range.label);
      parts.push(count ? calCount(this, this.calLabels.calendarEvents, count) : this.calLabels.calendarNoEvents);
      return parts.join(", ");
    },
    /**
     * Background ranges and background events covering a day. The time outside inverse ranges counts for a whole day only
     * (a day of opening hours is not shaded in the month), unless partial asks for parts of days too (the time grid).
     */
    calBackgroundsOn(day, resource, partial) {
      const out = [];
      // The time outside a resource's inverse ranges belongs to that resource's column or lane, never to a view of everyone.
      for (const range of this.calRanges) if (range.sd <= day && range.ed >= day && (resource === undefined ? !range.inverse || range.resource == null : range.resource == null || range.resource === resource) &&
          (partial || !range.inverse || range.start <= this.calZone.start(day) && range.end >= this.calZone.start(day + 1))) out.push(range);
      for (const event of this.calEvents) if (event.background && event.sd <= day && event.ed >= day && (resource === undefined || event.resource == null || event.resource === resource))
        out.push({ id: event.id, label: event.title, tone: event.tone || "info", kind: "background", sd: event.sd, ed: event.ed, start: event.start, end: event.end, resource: event.resource });
      return out;
    },

    calPaintMonth() {
      const range = this.calRange, body = this.calBody, weekCount = Math.round((range.lastDay - range.firstDay + 1) / 7);
      const available = body.clientHeight - CAL_NUMBER - 4, rowHeight = this.calPhone ? 44 : Math.max(96, Math.floor(available / weekCount));
      this.calCells = new Map();
      const grid = this.calMonthGrid(range.firstDay, range.lastDay, range.month, { rowHeight, dots: this.calPhone, outside: this.cal.outsideDays, labelledBy: this.calTitle.id });
      body.replaceChildren(grid);
      this.calGrid = grid;
      if (this.calPhone) { const day = this.calFocus?.day ?? this.calDate; body.appendChild(this.calDayList(day)); this.calMarkListedDay(day); }
    },
    /**
     * One month as an ARIA grid: weeks from first to last, events as bars and lines with "+N more" (or dots), outside days drawn
     * or left as empty pads, week numbers on each row when asked for. Fills this.calCells with its day cells.
     */
    calMonthGrid(first, last, monthStart, options) {
      const weekdays = this.calWeekdays(), today = this.calZone.day(Date.now()), month = calDayParts(monthStart).m, monthEnd = calAddMonths(monthStart, 1) - 1;
      const events = this.calEvents.filter(event => !event.background), rowHeight = options.rowHeight, valid = this.cal.validRange;
      const grid = h("div", "cx-cal-month" + (options.className ? " " + options.className : "")); grid.setAttribute("role", "grid");
      if (options.labelledBy) grid.setAttribute("aria-labelledby", options.labelledBy);
      grid.setAttribute("aria-readonly", String(!this.cal.editable && !this.cal.create));
      grid.style.setProperty("--cx-cal-cols", String(weekdays.length));
      grid.appendChild(this.calWeekdayRow("cx-cal-dow"));
      const weeks = h("div", "cx-cal-weeks"); weeks.setAttribute("role", "rowgroup"); grid.appendChild(weeks);
      const fit = Math.max(1, Math.floor((rowHeight - CAL_NUMBER - 4) / CAL_LANE));
      // Print shows every event: rows grow to their lanes instead of folding into "+N more".
      const limit = this.calPrinting ? Infinity : options.dots ? 0 : this.cal.eventLimit === "auto" ? fit : Math.min(this.cal.eventLimit, Math.max(fit, 1));
      for (let week = first; week <= last; week += 7) {
        const row = h("div", "cx-cal-week"), columns = new Map();
        row.setAttribute("role", "row"); row.style.minHeight = rowHeight + "px";
        if (this.cal.weekNumbers) {
          // The week's number names the row and shows in its first day.
          const number = this.calWeekNumber(week + 3);
          row.setAttribute("aria-label", fill(this.calLabels.calendarWeekNumber, { number }));
          row.dataset.cxWeek = String(number);
        }
        weekdays.forEach((dow, index) => columns.set(week + (dow - this.cal.firstDay + 7) % 7, index));
        const shown = [...columns.keys()].sort((a, b) => a - b);
        const outside = day => day < monthStart || day > monthEnd, pad = day => !options.outside && outside(day);
        const order = new Map(shown.map((day, index) => [day, index])), cells = [];
        for (const day of shown) {
          if (pad(day)) {
            // A day of another month the definition leaves out: an empty, inert cell keeps the columns.
            const empty = h("div", "cx-cal-pad"); empty.setAttribute("role", "gridcell"); empty.style.gridColumn = String(order.get(day) + 1);
            cells.push(empty); row.appendChild(empty); continue;
          }
          const invalid = valid && (day < valid.first || day > valid.last);
          const cell = h("div", "cx-cal-day" + (calDayParts(day).m !== month ? " cx-cal-out" : "") + (day === today ? " cx-cal-today" : "") + (invalid ? " cx-cal-invalid" : ""));
          cell.setAttribute("role", "gridcell"); cell.tabIndex = -1; cell.dataset.cxDay = String(day);
          if (invalid) cell.setAttribute("aria-disabled", "true");
          if (day === today) cell.setAttribute("aria-current", "date");
          const number = h("span", "cx-cal-num"); setText(number, this.calFmt.dayNumber(day)); number.setAttribute("aria-hidden", "true");
          cell.appendChild(number);
          if (this.cal.weekNumbers && cells.every(item => item.classList.contains("cx-cal-pad"))) {
            const wk = h("span", "cx-cal-wknum"); setText(wk, fill(this.calLabels.calendarWeekShort, { number: row.dataset.cxWeek })); wk.setAttribute("aria-hidden", "true"); cell.appendChild(wk);
          }
          cell.style.gridColumn = String(order.get(day) + 1);
          cells.push(cell); this.calCells.set(day, cell); row.appendChild(cell);
        }
        const weekEvents = events.filter(event => event.sd <= week + 6 && event.ed >= week);
        const placed = calLanes(weekEvents, week, week + 6, day => order.has(day) && !pad(day) ? order.get(day) : -1);
        if (this.calPrinting) row.style.minHeight = Math.max(rowHeight, CAL_NUMBER + 6 + (Math.max(-1, ...placed.map(item => item.lane)) + 1) * CAL_LANE) + "px";
        const totals = new Array(shown.length).fill(0);
        for (const item of placed) for (let col = item.from; col <= item.to; col++) totals[col]++;
        const dayLimit = totals.map(total => total > limit ? Math.max(0, limit - 1) : limit), visible = new Array(shown.length).fill(0);
        for (const item of placed) {
          let run = null;
          const flush = () => {
            if (!run) return;
            const event = item.event, bar = calInAllDayRow(event) || event.ed > event.sd, element = this.calEventElement(event, bar ? "bar" : "chip");
            element.style.setProperty("--c", String(run.from)); element.style.setProperty("--s", String(run.to - run.from + 1)); element.style.setProperty("--l", String(item.lane));
            if (event.sd < shown[run.from]) element.classList.add("cx-cal-cont-start");
            if (event.ed > shown[run.to]) element.classList.add("cx-cal-cont-end");
            cells[run.from].appendChild(element); run = null;
          };
          for (let col = item.from; col <= item.to; col++) {
            if (item.lane < dayLimit[col]) { visible[col]++; if (run) run.to = col; else run = { from: col, to: col }; }
            else flush();
          }
          flush();
        }
        cells.forEach((cell, col) => {
          if (cell.classList.contains("cx-cal-pad")) return;
          const day = shown[col], backgrounds = this.calBackgroundsOn(day);
          if (backgrounds.length) {
            cell.classList.add("cx-cal-bgday"); cell.style.setProperty("--cx-bg-tone", toneVariable(backgrounds[0].tone, false, "var(--hfx-color-status-info-fg)"));
            if (backgrounds[0].sd === day || col === 0) { const label = h("span", "cx-cal-bglabel"); setText(label, backgrounds[0].label); label.setAttribute("aria-hidden", "true"); cell.appendChild(label); }
          }
          const hidden = totals[col] - visible[col];
          cell.setAttribute("aria-label", this.calDayName(day, totals[col], backgrounds));
          if (options.dots && totals[col]) {
            const dots = h("span", "cx-cal-dots"); dots.setAttribute("aria-hidden", "true");
            for (const item of placed.filter(entry => entry.from <= col && entry.to >= col).slice(0, 3)) {
              const dot = h("i"); if (item.event.tone) dot.style.setProperty("--cx-ev", toneVariable(item.event.tone, false, "var(--hfx-color-accent)")); dots.appendChild(dot);
            }
            cell.appendChild(dots);
          } else if (hidden > 0) {
            const more = gridButton(fill(this.calLabels.calendarMore, { count: numberFormat(this.lang).format(hidden) }), () => {});
            more.className = "cx-cal-more-btn"; more.tabIndex = -1; more.dataset.cxDay = String(day);
            more.setAttribute("aria-label", fill(this.calLabels.calendarMoreLabel, { count: numberFormat(this.lang).format(hidden), date: this.calFmt.longDay(day) }));
            more.style.setProperty("--l", String(dayLimit[col])); more.style.setProperty("--c", String(col));
            cell.appendChild(more);
          }
        });
        weeks.appendChild(row);
      }
      return grid;
    },
    /**
     * The week number of a day: ISO 8601 (weeks from Monday, week 1 holds the year's first Thursday), or the locale's (weeks from
     * the calendar's first day, week 1 holds at least the locale's minimal days of January).
     */
    calWeekNumber(day) {
      if (this.cal.weekNumbers !== "locale") {
        const thursday = day - (calDow(day) + 6) % 7 + 3, year = calDayParts(thursday).y;
        return Math.floor((thursday - calDayNumber(year, 1, 1)) / 7) + 1;
      }
      let minimal = 1;
      try { const locale = new Intl.Locale(this.lang); minimal = (locale.getWeekInfo?.() || locale.weekInfo)?.minimalDays || 1; } catch { minimal = 1; }
      const start = calWeekStart(day, this.cal.firstDay), firstWeek = year => {
        const january = calDayNumber(year, 1, 1); let week = calWeekStart(january, this.cal.firstDay);
        if (week + 7 - january < minimal) week += 7;
        return week;
      };
      let year = calDayParts(start + 6).y, base = firstWeek(year);
      if (start < base) { year--; base = firstWeek(year); }
      return Math.floor((start - base) / 7) + 1;
    },
    /** The phone month marks the day its list shows. */
    calMarkListedDay(day) {
      for (const cell of this.calBody.querySelectorAll(".cx-cal-day[data-cx-listed]")) cell.removeAttribute("data-cx-listed");
      this.calBody.querySelector('.cx-cal-day[data-cx-day="' + day + '"]')?.setAttribute("data-cx-listed", "");
    },

    /** The phone month's list of one day's events, under the month. */
    calDayList(day) {
      const list = h("div", "cx-cal-daylist"), title = h("h3", "cx-cal-daylist-h"), events = this.calEventsOn(day);
      setText(title, this.calFmt.longDay(day)); list.appendChild(title);
      if (!events.length) { const empty = h("p", "cx-cal-empty"); setText(empty, this.calLabels.calendarNoEvents); list.appendChild(empty); }
      for (const event of events) list.appendChild(this.calEventElement(event, "item"));
      return list;
    },
    /** The non-background events on a day, all-day first, then by start. */
    calEventsOn(day) {
      const buckets = this.calDayBuckets;
      if (buckets?.events === this.calEvents && day >= buckets.first && day <= buckets.last) return buckets.days.get(day) || [];
      return this.calEvents.filter(event => !event.background && event.sd <= day && event.ed >= day).sort(calDayOrder);
    },
    /** Each day's events of a long period at once (a year's agenda), so a paint reads every event once, not once a day. */
    calBucketDays(first, last) {
      const days = new Map();
      for (const event of this.calEvents) if (!event.background) for (let day = Math.max(first, event.sd); day <= Math.min(last, event.ed); day++) (days.get(day) || days.set(day, []).get(day)).push(event);
      for (const list of days.values()) list.sort(calDayOrder);
      this.calDayBuckets = { events: this.calEvents, days, first, last };
    },

    /** Arrow keys between days, Page Up and Down by month (Shift: by year), Home and End in the week, Enter into the day. */
    calKeyMonth(event, cell) {
      const day = Number(cell.dataset.cxDay), key = event.key;
      let next = null;
      if (key === "ArrowLeft" || key === "ArrowRight") next = this.calShownDay(day + (key === "ArrowLeft" ? -1 : 1), key === "ArrowLeft" ? -1 : 1);
      else if (key === "ArrowUp" || key === "ArrowDown") next = day + (key === "ArrowUp" ? -7 : 7);
      else if (key === "Home") next = event.ctrlKey ? this.calShownDay(this.calRange.month, 1) : this.calShownDay(calWeekStart(day, this.cal.firstDay), 1);
      else if (key === "End") next = event.ctrlKey ? this.calShownDay(calAddMonths(this.calRange.month, 1) - 1, -1) : this.calShownDay(calWeekStart(day, this.cal.firstDay) + 6, -1);
      else if (key === "PageUp" || key === "PageDown") {
        const sign = key === "PageUp" ? -1 : 1, view = this.calView;
        next = view === "weekList" ? day + 7 * sign : view === "dayList" ? this.calShownDay(day + sign, sign) : calAddMonths(day, sign * (event.shiftKey ? 12 : 1));
      }
      else if (key === "Enter" || key === " " || key === "F2") {
        event.preventDefault();
        const first = cell.querySelector(".cx-cal-ev,.cx-cal-more-btn");
        if (first && key !== " ") { first.tabIndex = 0; cell.tabIndex = -1; first.focus(); }
        else this.calSelectDays(day, day);
        return true;
      }
      if (next === null) return false;
      event.preventDefault();
      this.calFocusDay(next);
      return true;
    },
    /** Inside a day: Up and Down between its events and "+N more", Escape back to the day, Left and Right to the next day. */
    calKeyInDay(event, item) {
      const cell = item.closest(".cx-cal-day"), items = [...cell.querySelectorAll(".cx-cal-ev,.cx-cal-more-btn")], at = items.indexOf(item), key = event.key;
      if (key === "ArrowDown" || key === "ArrowUp") { event.preventDefault(); const next = items[at + (key === "ArrowDown" ? 1 : -1)]; if (next) { item.tabIndex = -1; next.tabIndex = 0; next.focus(); } return true; }
      if (key === "Escape" || key === "ArrowLeft" || key === "ArrowRight") {
        event.preventDefault(); item.tabIndex = -1;
        const day = Number(cell.dataset.cxDay);
        if (key === "Escape") { cell.tabIndex = 0; cell.focus(); } else this.calFocusDay(this.calShownDay(day + (key === "ArrowLeft" ? -1 : 1), key === "ArrowLeft" ? -1 : 1));
        return true;
      }
      return false;
    },
    /** Moves focus to a day, changing the visible month (or week, or year) when the day is outside it. */
    calFocusDay(day) {
      const range = this.calRange, view = this.calView;
      const monthly = view === "month" || view === "mini", inside = monthly ? calMonthStart(day) === range.month : day >= range.firstDay && day <= range.lastDay;
      const valid = this.cal.validRange;
      if (valid && (day < valid.first || day > valid.last)) { this.calAnnounce(this.calLabels.calendarOutsideRange); return; }
      this.calFocus = { day, minutes: this.calFocus?.minutes ?? null, event: null };
      if (!inside) { this.calGo(monthly || view === "agenda" || view === "months" ? calMonthStart(day) : day, view, day).then(() => this.calRestoreFocus(true)); return; }
      if (this.calPhone && view === "month") {
        // The day's list under the month changes; the live region says which day and how many events it holds.
        const list = this.calBody.querySelector(".cx-cal-daylist");
        if (list) { this.calDisposeEventRenderers(list); list.replaceWith(this.calDayList(day)); }
        this.calMarkListedDay(day);
        const count = this.calEventsOn(day).length;
        this.calAnnounce(this.calFmt.longDay(day) + ", " + (count ? calCount(this, this.calLabels.calendarEvents, count) : this.calLabels.calendarNoEvents));
      }
      this.calRestoreFocus(true);
    }
  });
