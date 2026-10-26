  // ---------- calendar: week, day and N-day views (a time grid) ----------
  // An ARIA grid of time slots: a header row of days (or of days over resources), an all-day row for all-day events and
  // events of a day or longer, then one row per slot with a time row header and a gridcell per column. Timed events sit in
  // the slot cell they start in and are positioned over the minutes they cover; overlapping events share the column side by
  // side. Working hours, unavailable time and background ranges shade the columns behind the events; a line marks now.
  const CAL_SLOT_PX = 24, CAL_GUTTER = 64, CAL_ALLDAY_LANES = 3;

  Object.assign(DataGrid.prototype, {
    /** The time grid's columns: one per shown day, or per day and resource when resource columns apply. */
    calTimeColumns(days) {
      const all = this.calResourceColumns?.() || null;
      this.calResourcePages = null;
      if (!all) { this.calTimeWindow = null; return days.map(day => ({ day, resource: null })); }
      // Phones show two resources of a day (one a day in longer views) at a time, so titles stay readable; a picker above
      // the grid chooses which.
      // The first resource shown is kept, not a page number, so day and week views show the same resources after a switch.
      const size = this.calPhone && !this.calPrinting && all.length > 2 ? (days.length === 1 ? 2 : 1) : all.length, pages = Math.ceil(all.length / size);
      const page = Math.min(Math.floor((this.calResourceFirst || 0) / size), pages - 1);
      if (pages > 1) this.calResourcePages = { all, size, pages, page };
      const resources = all.slice(page * size, page * size + size);
      const out = [];
      for (const day of days) for (const resource of resources) out.push({ day, resource: resource.id, label: resource.label, group: resource.group });
      return this.calWindowTimeColumns(out);
    },

    /** A range picker beside the resource headers; native fitting still owns the mounted column window. */
    calResourcePicker() {
      const window = this.calTimeWindow, paging = this.calResourcePages;
      const total = window?.total ?? paging.all.length, size = window?.size ?? paging.size, first = window?.first ?? paging.page * size;
      const bar = h("div", "cx-cal-rpick"), select = h("select", "cx-cal-rpick-select"), maximum = window ? total - size : Math.floor((total - 1) / size) * size;
      const multiDay = window && window.columns[0].day !== window.columns.at(-1).day;
      const caption = column => this.calFmt.day({ weekday: "short", month: "short", day: "numeric" }, column.day) + " " + column.label;
      const range = at => multiDay ? caption(window.columns[at]) + " – " + caption(window.columns[Math.min(total - 1, at + size - 1)]) :
        fill(this.calLabels.calendarResourceWindow, { resources: this.calLabels.calendarResources, start: this.calFmt.number(at + 1), end: this.calFmt.number(Math.min(total, at + size)), total: this.calFmt.number(total) });
      const choices = new Set([first, maximum]); for (let at = 0; at < total; at += size) choices.add(Math.min(at, maximum));
      select.setAttribute("aria-label", range(first));
      for (const at of [...choices].sort((a,b) => a - b)) {
        const option = h("option"); option.value = String(at); setText(option, range(at)); select.appendChild(option);
      }
      const show = (at, focus) => { if (window) this.calTimeFirst = at; else this.calResourceFirst = at;
        this.calPaint({ keep: true }); this.calBody.querySelector(focus)?.focus({ preventScroll: true }); };
      select.value = String(first); select.addEventListener("change", () => show(Number(select.value), ".cx-cal-rpick-select"));
      const buttons = [-1,1].map(sign => { const button = h("button", "cx-btn ghost cx-cal-rpick-" + (sign < 0 ? "prev" : "next")), at = Math.max(0, Math.min(maximum, first + sign * size));
        button.type = "button"; button.disabled = at === first; setText(button, sign < 0 ? "←" : "→"); button.setAttribute("aria-label", (sign < 0 ? this.calLabels.calendarPrevious : this.calLabels.calendarNext) + ": " + range(at));
        button.addEventListener("click", () => show(at, ".cx-cal-rpick-select")); return button; });
      bar.append(buttons[0], select, buttons[1]);
      return bar;
    },
    calPaintTime() {
      const cal = this.cal, range = this.calRange, days = this.calShownDays(range.firstDay, range.lastDay), columns = this.calTimeColumns(days);
      const today = this.calZone.day(Date.now()), slot = cal.slotMinutes, ppm = CAL_SLOT_PX / slot, labels = this.calLabels, fmt = this.calFmt;
      const grid = h("div", "cx-cal-time"); grid.setAttribute("role", "grid"); grid.setAttribute("aria-labelledby", this.calTitle.id);
      grid.setAttribute("aria-readonly", String(!cal.editable));
      grid.style.setProperty("--cx-cal-n", String(columns.length)); grid.style.setProperty("--cx-cal-ppm", ppm + "px"); grid.style.setProperty("--cx-cal-gutter", CAL_GUTTER + "px");
      const head = h("div", "cx-cal-thead"); head.setAttribute("role", "rowgroup");
      const dayRow = h("div", "cx-cal-trow cx-cal-heads"); dayRow.setAttribute("role", "row");
      const corner = h("div", "cx-cal-corner"); corner.setAttribute("role", "columnheader"); dayRow.appendChild(corner);
      const resourceColumns = columns.some(column => column.resource != null), perDay = resourceColumns ? 2 : 1;
      const dayRuns = [];
      for (const column of columns) {
        const last = dayRuns.at(-1);
        if (last?.day === column.day) last.count++; else dayRuns.push({ day: column.day, count: 1, index: column.index ?? columns.indexOf(column) });
      }
      for (const { day, count, index } of dayRuns) {
        const cell = h("div", "cx-cal-dayhead" + (day === today ? " cx-cal-today" : "")); cell.setAttribute("role", "columnheader"); cell.dataset.cxDay = String(day);
        cell.setAttribute("aria-colindex", String(index + 2));
        cell.style.flexGrow = String(count); cell.setAttribute("aria-label", fmt.longDay(day)); if (count > 1) cell.setAttribute("aria-colspan", String(count));
        if (!this.calAllowsSpan(day * CAL_DAY, (day + 1) * CAL_DAY, true)) { cell.classList.add("cx-cal-invalid"); cell.setAttribute("aria-disabled", "true"); }
        const name = h("span", "cx-cal-dayname"), number = h("span", "cx-cal-daynum");
        setText(name, fmt.weekday(day, "short")); setText(number, fmt.dayNumber(day)); cell.append(name, number);
        if (day === today) cell.setAttribute("aria-current", "date");
        dayRow.appendChild(cell);
      }
      head.appendChild(dayRow);
      if (perDay > 1 && columns.some(column => column.group)) {
        // Grouped headers: each run of resources that share a parent (a team, a site) under one heading.
        const groupRow = h("div", "cx-cal-trow cx-cal-gheads"); groupRow.setAttribute("role", "row");
        const blank = h("div", "cx-cal-corner"); blank.setAttribute("role", "columnheader"); groupRow.appendChild(blank);
        for (let at = 0; at < columns.length;) {
          let end = at; while (end + 1 < columns.length && columns[end + 1].group === columns[at].group && columns[end + 1].day === columns[at].day) end++;
          const cell = h("div", "cx-cal-ghead"); cell.setAttribute("role", "columnheader"); cell.setAttribute("aria-colspan", String(end - at + 1));
          cell.setAttribute("aria-colindex", String((columns[at].index ?? at) + 2));
          cell.style.flexGrow = String(end - at + 1); setText(cell, columns[at].group || ""); cell.title = columns[at].group || "";
          groupRow.appendChild(cell); at = end + 1;
        }
        head.appendChild(groupRow);
      }
      if (perDay > 1) {
        const resourceRow = h("div", "cx-cal-trow cx-cal-rheads"); resourceRow.setAttribute("role", "row");
        const blank = h("div", "cx-cal-corner"); blank.setAttribute("role", "columnheader"); resourceRow.appendChild(blank);
        for (const column of columns) { const cell = h("div", "cx-cal-rhead"); cell.setAttribute("role", "columnheader"); cell.setAttribute("aria-colindex", String((column.index ?? columns.indexOf(column)) + 2)); setText(cell, column.label); cell.title = column.label; resourceRow.appendChild(cell); }
        head.appendChild(resourceRow);
      }
      head.appendChild(this.calAllDayRow(columns, days));
      grid.appendChild(head);
      const scroller = this.calScroller = h("div", "cx-cal-scroll"), slots = h("div", "cx-cal-slots");
      slots.setAttribute("role", "rowgroup");
      const visible = cal.maxMinutes - cal.minMinutes;
      slots.style.height = visible * ppm + "px";
      scroller.style.setProperty("--cx-cal-slots-height", visible * ppm + "px");
      this.calSlotCells = new Map();
      const segmentsByColumn = columns.map(column => calSegments(this, this.calEvents.filter(event => column.resource == null || this.calHasResource(event, column.resource)).map(event => column.resource == null ? event : { ...event, resource: column.resource }), column.day, cal.minMinutes, cal.maxMinutes));
      for (let minutes = cal.minMinutes; minutes < cal.maxMinutes; minutes += slot) {
        const row = h("div", "cx-cal-srow" + (minutes % 60 === 0 ? " cx-cal-hour" : "")); row.setAttribute("role", "row");
        const label = h("div", "cx-cal-stime"); label.setAttribute("role", "rowheader");
        if (minutes % 60 === 0 || slot >= 60) setText(label, fmt.clock(minutes)); else { label.setAttribute("aria-label", fmt.clock(minutes)); }
        row.appendChild(label);
        columns.forEach((column, index) => {
          const cell = h("div", "cx-cal-slot"); cell.setAttribute("role", "gridcell"); cell.tabIndex = -1;
          cell.setAttribute("aria-colindex", String((column.index ?? index) + 2));
          cell.dataset.cxDay = String(column.day); cell.dataset.cxMinutes = String(minutes); if (column.resource != null) cell.dataset.cxResource = column.resource;
          if (!this.calAllowsSpan(column.day * CAL_DAY, (column.day + 1) * CAL_DAY, true)) { cell.classList.add("cx-cal-invalid"); cell.setAttribute("aria-disabled", "true"); }
          cell.setAttribute("aria-label", fmt.longDay(column.day) + ", " + fmt.clock(minutes) + (column.label ? ", " + column.label : ""));
          if (column.day === today) cell.classList.add("cx-cal-today");
          this.calSlotCells.set(index + ":" + minutes, cell);
          row.appendChild(cell);
        });
        slots.appendChild(row);
      }
      columns.forEach((column, index) => {
        this.calShade(slots, column, index, ppm);
        for (const segment of segmentsByColumn[index]) {
          const event = segment.event, element = this.calEventElement(event, "block");
          element.style.setProperty("--d", String(index)); element.style.setProperty("--c", String(segment.col)); element.style.setProperty("--k", String(segment.cols));
          element.style.setProperty("--sp", String(segment.span)); element.style.setProperty("--t", String(segment.top - cal.minMinutes));
          element.style.setProperty("--h", String(Math.max(segment.bottom - segment.top, event.marker ? 0 : this.calMinSegment)));
          if (segment.clippedTop) element.classList.add("cx-cal-cont-start");
          if (segment.clippedBottom) element.classList.add("cx-cal-cont-end");
          if ((segment.bottom - segment.top) * ppm < 40) element.classList.add("cx-cal-short");
          const start = Math.min(cal.maxMinutes - slot, Math.floor(segment.top / slot) * slot);
          (this.calSlotCells.get(index + ":" + start) || slots).appendChild(element);
        }
        const count = segmentsByColumn[index].length;
        if (count) for (let minutes = cal.minMinutes; minutes < cal.maxMinutes; minutes += slot) {
          const cell = this.calSlotCells.get(index + ":" + minutes), starting = cell.querySelectorAll(".cx-cal-ev").length;
          if (starting) cell.setAttribute("aria-label", cell.getAttribute("aria-label") + ", " + calCount(this, labels.calendarEvents, starting));
        }
      });
      if (cal.now) { this.calNowLine = h("div", "cx-cal-now"); this.calNowLine.setAttribute("aria-hidden", "true"); slots.appendChild(this.calNowLine); this.calNowColumns = columns; }
      scroller.appendChild(slots); grid.appendChild(scroller);
      this.calBody.replaceChildren(...(this.calResourcePages || this.calTimeWindow ? [this.calResourcePicker()] : []), grid);
      grid.style.maxHeight = (visible * ppm + head.offsetHeight + 2) + "px";
      if (this.calTimeWindow) grid.setAttribute("aria-colcount", String(this.calTimeWindow.total + 1));
      this.calGrid = grid;
      if (cal.now) this.calTick();
      // The header leaves room for the slots' scrollbar, so the day columns line up.
      head.style.paddingInlineEnd = Math.max(0, scroller.offsetWidth - scroller.clientWidth) + "px";
      if (!this.calScrolled || this.calScrolledView !== this.calView) {
        this.calScrolled = true; this.calScrolledView = this.calView;
        // scrollTime first; today's now line comes into view when it would sit below the first screen.
        const now = this.calZone.parts(Date.now()).minutes, shown = scroller.clientHeight / ppm;
        const target = days.includes(today) && now > cal.scrollMinutes + shown - 60 ? now - 60 : cal.scrollMinutes;
        // A little above the hour, so its label, centred on the line, shows whole.
        scroller.scrollTop = Math.max(0, (target - cal.minMinutes) * ppm - 10);
      }
    },

    /** The all-day row: all-day events and events of a day or longer, in lanes, with "+N more" past three lanes. */
    calAllDayRow(columns, days) {
      const row = h("div", "cx-cal-trow cx-cal-allrow"); row.setAttribute("role", "row");
      const label = h("div", "cx-cal-stime cx-cal-alllabel"); label.setAttribute("role", "rowheader"); setText(label, this.calLabels.calendarAllDay); row.appendChild(label);
      const index = new Map(), events = this.calEvents.filter(event => !event.background && calInAllDayRow(event));
      const perDay = columns.some(column => column.resource != null) ? 2 : 1, cells = [];
      columns.forEach((column, at) => {
        const cell = h("div", "cx-cal-allcell"); cell.setAttribute("role", "gridcell"); cell.tabIndex = -1; cell.dataset.cxDay = String(column.day); cell.setAttribute("aria-colindex", String((column.index ?? at) + 2));
        if (!this.calAllowsSpan(column.day * CAL_DAY, (column.day + 1) * CAL_DAY, true)) { cell.classList.add("cx-cal-invalid"); cell.setAttribute("aria-disabled", "true"); }
        if (column.resource != null) cell.dataset.cxResource = column.resource;
        cells.push(cell); row.appendChild(cell);
        if (perDay === 1) index.set(column.day, at);
      });
      const placed = [];
      if (perDay === 1) placed.push(...calLanes(events, days[0], days[days.length - 1], day => index.has(day) ? index.get(day) : -1));
      else columns.forEach((column, at) => { for (const event of events) if (event.sd <= column.day && event.ed >= column.day && this.calHasResource(event, column.resource)) placed.push({ event: { ...event, resource: column.resource }, lane: 0, from: at, to: at }); });
      if (perDay > 1) { const lanes = new Map(); for (const item of placed) { item.lane = lanes.get(item.from) || 0; lanes.set(item.from, item.lane + 1); } }
      const totals = new Array(columns.length).fill(0), shown = new Array(columns.length).fill(0);
      for (const item of placed) for (let at = item.from; at <= item.to; at++) totals[at]++;
      const lanes = Math.min(CAL_ALLDAY_LANES, Math.max(0, ...placed.map(item => item.lane + 1))), limit = totals.map(total => total > lanes ? lanes - 1 : lanes);
      for (const item of placed) {
        let from = null;
        const flush = to => { if (from === null) return; const element = this.calEventElement(item.event, "bar");
          element.style.setProperty("--c", String(from)); element.style.setProperty("--s", String(to - from + 1)); element.style.setProperty("--l", String(item.lane));
          if (item.event.sd < columns[from].day) element.classList.add("cx-cal-cont-start"); if (item.event.ed > columns[to].day) element.classList.add("cx-cal-cont-end");
          cells[from].appendChild(element); from = null; };
        for (let at = item.from; at <= item.to; at++) { if (item.lane < limit[at]) { shown[at]++; if (from === null) from = at; } else flush(at - 1); }
        flush(item.to);
      }
      cells.forEach((cell, at) => {
        const hidden = totals[at] - shown[at], day = columns[at].day;
        cell.setAttribute("aria-label", this.calLabels.calendarAllDay + ", " + this.calDayName(day, totals[at], this.calBackgroundsOn(day, columns[at].resource ?? undefined)));
        if (hidden > 0) {
          const more = gridButton(fill(this.calLabels.calendarMore, { count: numberFormat(this.lang).format(hidden) }), () => {});
          more.className = "cx-cal-more-btn"; more.tabIndex = -1; more.dataset.cxDay = String(day); more.style.setProperty("--l", String(limit[at])); more.style.setProperty("--c", String(at));
          more.setAttribute("aria-label", fill(this.calLabels.calendarMoreLabel, { count: numberFormat(this.lang).format(hidden), date: this.calFmt.longDay(day) }));
          cell.appendChild(more);
        }
      });
      row.style.setProperty("--cx-cal-lanes", String(Math.max(1, lanes)));
      return row;
    },

    /** Shading behind one column: outside working hours (or the resource's business hours), unavailable time and background ranges. */
    calShade(slots, column, index, ppm) {
      const cal = this.cal, dow = calDow(column.day), add = (from, to, cls, label, tone) => {
        const top = Math.max(from, cal.minMinutes), bottom = Math.min(to, cal.maxMinutes);
        if (bottom <= top) return;
        const block = h("div", "cx-cal-shade " + cls); block.setAttribute("aria-hidden", "true");
        block.style.setProperty("--d", String(index)); block.style.setProperty("--t", String(top - cal.minMinutes)); block.style.setProperty("--h", String(bottom - top));
        if (tone) block.style.setProperty("--cx-bg-tone", toneVariable(tone, false, "var(--hfx-color-status-info-fg)"));
        if (label && (bottom - top) * ppm >= 18) { const text = h("span"); setText(text, label); block.appendChild(text); }
        slots.appendChild(block);
      };
      const hours = this.calHoursFor?.(column.resource, dow) ?? (cal.working && cal.working.days.has(dow) ? [cal.working] : cal.working ? [] : null);
      if (hours) {
        let at = 0;
        for (const span of hours.slice().sort((a, b) => a.start - b.start)) { add(at, span.start, "cx-cal-off"); at = Math.max(at, span.end); }
        add(at, 1440, "cx-cal-off");
      }
      const zone = this.calZone, dayStart = zone.start(column.day), dayEnd = zone.start(column.day + 1);
      for (const range of this.calBackgroundsOn(column.day, column.resource ?? undefined, true)) {
        const from = range.start <= dayStart ? 0 : zone.parts(range.start).minutes, to = range.end >= dayEnd ? 1440 : zone.parts(range.end).minutes;
        add(from, to, range.kind === "unavailable" ? "cx-cal-unavailable" : "cx-cal-bgrange", range.label, range.kind === "unavailable" ? null : range.tone);
      }
    }
  });
