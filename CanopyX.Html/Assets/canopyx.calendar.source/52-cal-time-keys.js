  // ---------- calendar: keys, the now line and scrolling of the time grid ----------
  // Slots: Up and Down by slot (Up from the first slot reaches the all-day row), Left and Right by column, Home and End to the
  // first and last slot, Page Up and Down by period, Shift with Up or Down extends a selection of slots, Space selects, Enter
  // goes to the first event that starts in the slot. Events: Up and Down to the previous and next event of the column,
  // Left and Right back to the neighbouring column's slot, Escape back to the slot, Enter opens the record.
  Object.assign(DataGrid.prototype, {
    calKeyTime(event, target, eventElement) {
      const key = event.key, cal = this.cal, slot = cal.slotMinutes;
      const cell = eventElement ? this.calSlotOf(eventElement) : target.closest(".cx-cal-slot,.cx-cal-allcell");
      if (!cell) return;
      const columns = [...this.calGrid.querySelectorAll(".cx-cal-allcell")], resource = cell.dataset.cxResource;
      const column = columns.findIndex(item => item.dataset.cxDay === cell.dataset.cxDay && item.dataset.cxResource === resource);
      const minutes = cell.dataset.cxMinutes === undefined ? null : Number(cell.dataset.cxMinutes);
      // Columns are read again on each move: a step to the next period repaints them.
      const go = (index, at) => {
        const fresh = [...this.calGrid.querySelectorAll(".cx-cal-allcell")], target = fresh[index === "last" ? fresh.length - 1 : Math.max(0, Math.min(fresh.length - 1, index))];
        if (!target) return;
        const day = Number(target.dataset.cxDay);
        if (!this.calAllowsSpan(day * CAL_DAY, (day + 1) * CAL_DAY, true)) return;
        this.calFocus = { day, minutes: at, event: null, resource: target.dataset.cxResource };
        const element = at === null ? target : this.calGrid.querySelector('.cx-cal-slot[data-cx-day="' + day + '"][data-cx-minutes="' + at + '"]' + (target.dataset.cxResource !== undefined ? '[data-cx-resource="' + CSS.escape(target.dataset.cxResource) + '"]' : ""));
        if (element) { for (const other of this.calBody.querySelectorAll('[tabindex="0"]')) other.tabIndex = -1; element.tabIndex = 0; element.focus(); }
      };
      if (eventElement) {
        if (key === "Escape" || key === "ArrowLeft" || key === "ArrowRight") { event.preventDefault(); go(column + (key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0), minutes); return; }
        if (key === "ArrowUp" || key === "ArrowDown") {
          event.preventDefault();
          const list = [...this.calGrid.querySelectorAll(".cx-cal-ev")].filter(item => { const owner = this.calSlotOf(item); return owner && owner.dataset.cxDay === cell.dataset.cxDay && owner.dataset.cxResource === resource; });
          const next = list[list.indexOf(eventElement) + (key === "ArrowDown" ? 1 : -1)];
          if (next) { eventElement.tabIndex = -1; next.tabIndex = 0; next.focus(); }
        }
        return;
      }
      const first = cal.minMinutes, last = cal.maxMinutes - slot;
      if (key === "ArrowLeft" || key === "ArrowRight") {
        event.preventDefault();
        const next = column + (key === "ArrowLeft" ? -1 : 1), pages = this.calResourcePages;
        // Past the edge of a page of resource columns (phones), the next page comes before the next period.
        if (pages && (next < 0 ? pages.page > 0 : next >= columns.length && pages.page < pages.pages - 1)) {
          this.calResourceFirst = (pages.page + (next < 0 ? -1 : 1)) * pages.size; this.calPaint({ keep: true }); go(next < 0 ? "last" : 0, minutes); return;
        }
        if (next < 0 || next >= columns.length) { this.calendarStep(next < 0 ? -1 : 1).then(() => go(next < 0 ? "last" : 0, minutes)); return; }
        go(next, minutes);
      } else if (key === "ArrowUp" || key === "ArrowDown") {
        event.preventDefault();
        const next = minutes === null ? (key === "ArrowDown" ? first : null) : minutes + (key === "ArrowUp" ? -slot : slot);
        if (minutes !== null && next < first) { go(column, null); return; }
        if (next === null || next > last) return;
        if (event.shiftKey && minutes !== null) {
          // The slot focused when Shift went down anchors the range.
          const anchor = this.calAnchorMinutes ?? minutes;
          this.calAnchorMinutes = anchor;
          this.calSelectSlots(Number(cell.dataset.cxDay), Math.min(anchor, next), Math.max(anchor, next) + slot, resource);
        } else this.calAnchorMinutes = null;
        go(column, next);
      } else if (key === "Home" || key === "End") { event.preventDefault(); go(column, key === "Home" ? first : last); }
      else if (key === "PageUp" || key === "PageDown") { event.preventDefault(); this.calendarStep(key === "PageUp" ? -1 : 1).then(() => go(column, minutes)); }
      else if (key === " ") { event.preventDefault(); if (minutes === null) this.calSelectDays(Number(cell.dataset.cxDay), Number(cell.dataset.cxDay), resource); else this.calSelectSlots(Number(cell.dataset.cxDay), minutes, minutes + slot, resource); }
      else if (key === "Enter" || key === "F2") {
        event.preventDefault();
        const inside = cell.querySelector(".cx-cal-ev,.cx-cal-more-btn");
        if (inside) { cell.tabIndex = -1; inside.tabIndex = 0; inside.focus(); }
        else if (minutes === null) this.calSelectDays(Number(cell.dataset.cxDay), Number(cell.dataset.cxDay), resource);
        else this.calSelectSlots(Number(cell.dataset.cxDay), minutes, minutes + slot, resource);
      }
    },
    /** The slot or all-day cell an event element sits in. */
    calSlotOf(element) { return element.closest(".cx-cal-slot,.cx-cal-allcell"); },

    /** Moves the now line (time grid) and the timeline's now marker; called each minute. */
    calTick() {
      const line = this.calNowLine;
      if (line?.isConnected && this.calNowColumns) {
        const now = Date.now(), today = this.calZone.day(now), minutes = this.calZone.parts(now).minutes, cal = this.cal;
        const first = this.calNowColumns.findIndex(column => column.day === today), count = this.calNowColumns.filter(column => column.day === today).length;
        line.hidden = first < 0 || minutes < cal.minMinutes || minutes >= cal.maxMinutes;
        line.style.setProperty("--d", String(Math.max(0, first))); line.style.setProperty("--sp", String(count || 1)); line.style.setProperty("--t", String(minutes - cal.minMinutes));
        line.title = this.calLabels.calendarNow + " " + this.calFmt.time(now);
      }
      this.calTickTimeline?.();
    },

    calScrollState() {
      if (this.calView === "timeline") return this.calTimelineScroll?.() || null;
      const scroller = this.calScroller?.isConnected && this.calBody.contains(this.calScroller) ? this.calScroller : null;
      return { top: scroller ? scroller.scrollTop : this.calBody.scrollTop, body: !scroller, view: this.calView, date: this.calDate };
    },
    calRestoreScroll(state) {
      if (state.view !== this.calView || state.date !== this.calDate && this.calView !== "week" && this.calView !== "day" && this.calView !== "days") return false;
      if (state.timeline) return this.calRestoreTimelineScroll?.(state);
      if (state.body) this.calBody.scrollTop = state.top; else if (this.calScroller?.isConnected) this.calScroller.scrollTop = state.top;
      return true;
    }
  });
