  // ---------- calendar shared screens: finished events, day header notes and days that fit ----------
  // fadePast fades events that have ended in the week, day, N-day, list and agenda views, and keeps fading them as time passes.
  // Day headers carry the definition's dayNotes and whatever the host's dayHeader hook returns: text, or content the hook writes
  // into a fresh element with DOM methods, as the event template does; the calendar never writes host markup. The note's text
  // joins the day's accessible name. dayWidth keeps the columns of the week, N-day and week list views at least that wide:
  // as the calendar (not the window) narrows they show one day fewer at a time, always keeping today, and step by the days
  // shown. listDays sets the week list's own length, and a week list with fewer columns than listBelow stacks its days instead.
  const CAL_SCREEN_DAYS = { range: DataGrid.prototype.calRangeOf, step: DataGrid.prototype.calStepDate, count: DataGrid.prototype.calDaysCount,
    today: DataGrid.prototype.calendarToday, view: DataGrid.prototype.setCalendarView, paint: DataGrid.prototype.calPaint,
    list: DataGrid.prototype.calDayList };
  const CAL_FADE_VIEWS = ["week", "day", "days", "weekList", "dayList", "agenda"];

  Object.assign(DataGrid.prototype, {
    /** Marks finished events (one element, or every drawn event) in the views that fade them. */
    calMarkPast(element) {
      if (!this.cal.fadePast || !this.calBody) return;
      const now = Date.now(), on = CAL_FADE_VIEWS.includes(this.calView);
      for (const item of element ? [element] : this.calBody.querySelectorAll(".cx-cal-ev"))
        if (item._calEvent) item.classList.toggle("cx-cal-past", on && this.calDisplaySpan(item._calEvent).end <= now);
    },
    calPaint(options) {
      CAL_SCREEN_DAYS.paint.call(this, options);
      if (!this.cal.dayNotes || !this.calBody) return;
      const list = this.calBody.querySelector(".cx-cal-list");
      if (list && (this.cal.dayWidth || this.cal.listDays || this.cal.listBelow)) { list.classList.add("cx-cal-boxes"); list.classList.toggle("cx-cal-stack", this.calStacked()); }
      this.calDayNotes();
    },
    /** Writes each shown day's notes into its header. A phone month's small cells carry them in their names, and the list of
     *  the chosen day under the month shows them. */
    calDayNotes() {
      if (!this.cal.dayNotes.size && typeof this.opts.calendar?.dayHeader !== "function") return;
      const heads = [];
      for (const head of this.calBody.querySelectorAll(".cx-cal-dayhead[data-cx-day]")) heads.push([head, head, head]);
      for (const cell of this.calBody.querySelectorAll(".cx-cal-lday[data-cx-day]")) heads.push([cell, cell.querySelector(".cx-cal-lhead"), cell]);
      for (const cell of this.calBody.querySelectorAll(".cx-cal-month:not(.cx-cal-mini) .cx-cal-day[data-cx-day]")) heads.push([cell, this.calPhone ? null : cell, cell]);
      for (const group of this.calBody.querySelectorAll(".cx-cal-agroup")) heads.push([group.querySelector(".cx-cal-arow"), group.querySelector(".cx-cal-ahead-c"), null]);
      for (const [dated, target, named] of heads) {
        const notes = this.calNotesOf(Number(dated.dataset.cxDay));
        if (!notes) continue;
        notes.box.setAttribute("aria-hidden", String(!!named));
        target?.appendChild(notes.box);
        if (named) named.setAttribute("aria-label", named.getAttribute("aria-label") + ", " + notes.texts.join(", "));
      }
    },
    /** One day's notes and what the host's dayHeader hook adds: { box, texts }, or null for a day without any. */
    calNotesOf(day) {
      const hook = this.opts.calendar?.dayHeader, box = h("span", "cx-cal-notes"), texts = [];
      for (const note of this.cal.dayNotes.get(day) || []) {
        const item = h("span", "cx-cal-note"); setText(item, note.text);
        if (note.tone) item.style.setProperty("--cx-note", toneVariable(note.tone, false, "var(--hfx-color-text-secondary)"));
        box.appendChild(item); texts.push(note.text);
      }
      if (typeof hook === "function") {
        const element = h("span", "cx-cal-note cx-cal-note-host");
        try {
          const answer = hook({ day: calDayText(day), events: this.calEventsOn(day).length, view: this.calView, element, labels: this.calLabels });
          if (typeof answer === "string" && answer.trim()) setText(element, answer.trim());
          if (answer === true || typeof answer === "string" && answer.trim()) { box.appendChild(element); if (element.textContent.trim()) texts.push(element.textContent.trim()); }
        } catch (error) { this.emit("error", { error }); }
      }
      return box.childNodes.length ? { box, texts } : null;
    },
    /** The list of a day under a phone month shows the day's notes beside its heading. */
    calDayList(day) {
      const list = CAL_SCREEN_DAYS.list.call(this, day), notes = this.cal.dayNotes && this.calNotesOf(day);
      if (notes) list.querySelector(".cx-cal-daylist-h").append(" ", notes.box);
      return list;
    },

    /** The days a run view shows on its own: the week's shown days, the N-day count, or listDays for the week list. */
    calOwnDays(view) {
      return view === "days" ? CAL_SCREEN_DAYS.count.call(this) : view === "weekList" && this.cal.listDays || 7 - this.cal.hidden.size;
    },
    /** How many days fit at dayWidth in the calendar's own width (all of them without dayWidth). */
    calFitDays(view) {
      const own = this.calOwnDays(view), width = this.calRoot?.clientWidth || this.host.clientWidth;
      return this.cal.dayWidth && width ? Math.max(1, Math.min(own, Math.floor((width - (view === "weekList" ? 0 : CAL_GUTTER)) / this.cal.dayWidth))) : own;
    },
    /** A week list too narrow for listBelow columns stacks its days. */
    calStacked() { return !!this.cal.listBelow && this.calView === "weekList" && this.calFitDays("weekList") < this.cal.listBelow; },
    /** The days a view shows as a run from its date, or 0 when it keeps its own period (a whole week, say). */
    calRunDays(view) {
      const cal = this.cal;
      if (!cal.dayNotes || !["week", "days", "weekList"].includes(view) || !cal.dayWidth && !(view === "weekList" && cal.listDays)) return 0;
      const own = this.calOwnDays(view), fit = view === "weekList" && cal.listBelow && this.calFitDays(view) < cal.listBelow ? own : this.calFitDays(view);
      return view === "week" || view === "weekList" && !cal.listDays ? (fit < own ? fit : 0) : fit;
    },
    /** The first day of a run that keeps today (or the day) in the view's own period, leaving out earlier days first. */
    calFitStart(view, day) {
      const run = this.calRunDays(view);
      if (!run) return day;
      const own = view === "week" || view === "weekList" && !this.cal.listDays ? CAL_SCREEN_DAYS.range.call(this, view, day) : this.calRunRange(day, this.calOwnDays(view));
      const shown = this.calShownDays(own.firstDay, own.lastDay), today = this.calZone.day(Date.now()), anchor = shown.includes(today) ? today : day;
      const at = Math.max(0, shown.findIndex(item => item >= anchor));
      return shown[Math.max(0, Math.min(at, shown.length - run))] ?? day;
    },
    calRunRange(day, count) {
      let last = day;
      for (let shown = 0; shown < count; last++) if (!this.cal.hidden.has(calDow(last))) shown++;
      return { firstDay: day, lastDay: last - 1 };
    },
    calRangeOf(view, date) {
      const run = this.calRunDays(view);
      return run ? this.calRunRange(date, run) : CAL_SCREEN_DAYS.range.call(this, view, date);
    },
    calDaysCount() { return this.calRunDays("days") || CAL_SCREEN_DAYS.count.call(this); },
    calStepDate(direction) {
      const run = this.calRunDays(this.calView);
      if (!run) return CAL_SCREEN_DAYS.step.call(this, direction);
      if (direction > 0) return this.calShownDay(this.calRangeOf(this.calView, this.calDate).lastDay + 1, 1);
      let day = this.calDate;
      for (let shown = 0; shown < run;) { day--; if (!this.cal.hidden.has(calDow(day))) shown++; }
      return day;
    },
    calendarToday() {
      if (!this.calRunDays(this.calView)) return CAL_SCREEN_DAYS.today.call(this);
      const today = this.calClampDay(this.calZone.day(Date.now()));
      return this.calGo(this.calFitStart(this.calView, today), this.calView, today);
    },
    setCalendarView(view) {
      if (!this.cal?.views.includes(view) || !this.calRunDays(view)) return CAL_SCREEN_DAYS.view.call(this, view);
      const day = this.calFocus?.day ?? this.calDate;
      return this.calGo(this.calFitStart(view, day), view, day);
    },
    /** Follows the calendar's width: a different number of days, or stacking, moves to a run that keeps today. */
    calStartFit() {
      const key = () => this.calView + ":" + this.calRunDays(this.calView) + ":" + this.calStacked();
      if (this.calRunDays(this.calView)) { this.calDate = this.calFitStart(this.calView, this.calDate); this.calRange = this.calRangeOf(this.calView, this.calDate); }
      let last = key(), frame = 0;
      const observer = new ResizeObserver(() => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const next = key();
          if (next === last || this.destroyed || !this.calRange) { last = next; return; }
          const view = this.calView, sameView = next.split(":")[0] === last.split(":")[0];
          last = next;
          if (sameView) this.calGo(this.calFitStart(view, this.calRange.firstDay), view, this.calFocus?.day ?? this.calDate);
        });
      });
      observer.observe(this.calRoot);
      this.lifetime.signal.addEventListener("abort", () => { observer.disconnect(); cancelAnimationFrame(frame); }, { once: true });
    }
  });
