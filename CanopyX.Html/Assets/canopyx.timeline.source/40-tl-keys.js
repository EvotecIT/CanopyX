  // ---------- resource timeline: keys, clicks, selecting resources and units, and dragging across resources ----------
  // The lanes are an ARIA grid: a row per resource the tree shows and a gridcell per unit. Left and Right move by unit (past the
  // span they step to the next one), Up and Down by resource, Home and End to the span's first and last unit, Page Up and Down
  // by span. Enter goes to the first event in the unit, Left and Right then move between the lane's events, Escape returns.
  // Space or a click selects the unit of that resource and reports it as a link change.
  Object.assign(DataGrid.prototype, {
    calKeyTimeline(event, target, eventElement) {
      const key = event.key, tree = this.tlTree, axis = this.tlAxis;
      const cell = eventElement ? eventElement.closest(".cx-tl-cell") : target.closest(".cx-tl-cell");
      if (!cell || !tree || !axis) return;
      const unit = Number(cell.dataset.cxUnit), resource = cell.dataset.cxResource, rowIndex = tree.rows.findIndex(row => row.key === resource);
      if (eventElement) {
        if (key === "Escape") { event.preventDefault(); this.tlFocusCell(rowIndex, unit); return; }
        if (key === "ArrowLeft" || key === "ArrowRight") {
          event.preventDefault();
          const list = [...this.tlLanes.get(resource)?.querySelectorAll(".cx-cal-ev") || []].sort((a, b) => a._calEvent.start - b._calEvent.start);
          const next = list[list.indexOf(eventElement) + (key === "ArrowLeft" ? -1 : 1)];
          if (next) { eventElement.tabIndex = -1; next.tabIndex = 0; next.focus(); }
        }
        return;
      }
      if (key === "ArrowLeft" || key === "ArrowRight") {
        event.preventDefault();
        const next = unit + (key === "ArrowLeft" ? -1 : 1);
        if (next < 0 || next >= axis.units.length) { this.calendarStep(next < 0 ? -1 : 1).then(() => this.tlFocusCell(rowIndex, next < 0 ? this.tlAxis.units.length - 1 : 0)); return; }
        this.tlFocusCell(rowIndex, next);
      } else if (key === "ArrowUp" || key === "ArrowDown") {
        event.preventDefault();
        let next = rowIndex + (key === "ArrowUp" ? -1 : 1);
        while (tree.rows[next]?.status) next += key === "ArrowUp" ? -1 : 1;
        if (next >= 0 && next < tree.rows.length) this.tlFocusCell(next, unit);
      } else if (key === "Home" || key === "End") { event.preventDefault(); this.tlFocusCell(rowIndex, key === "Home" ? 0 : axis.units.length - 1); }
      else if (key === "PageUp" || key === "PageDown") { event.preventDefault(); this.calendarStep(key === "PageUp" ? -1 : 1).then(() => this.tlFocusCell(rowIndex, unit)); }
      else if (key === " " || key === "Enter") {
        event.preventDefault();
        const inside = cell.querySelector(".cx-cal-ev");
        if (key === "Enter" && inside) { cell.tabIndex = -1; inside.tabIndex = 0; inside.focus(); }
        else this.tlSelectUnit(axis.units[unit], resource);
      }
    },
    /** Focuses the cell of a row and unit, scrolling it into view first so its lane exists. */
    tlFocusCell(rowIndex, unitIndex) {
      const tree = this.tlTree, axis = this.tlAxis, main = this.tlMain, row = tree.rows[rowIndex], unit = axis.units[unitIndex];
      if (!row || !unit) return;
      const top = tree.tops[rowIndex], bottom = tree.tops[rowIndex + 1] ?? top + tree.rowH, head = this.tlHead.offsetHeight;
      if (top < main.scrollTop) main.scrollTop = top;
      else if (bottom > main.scrollTop + main.clientHeight - head) main.scrollTop = bottom - main.clientHeight + head;
      if (unit.x < main.scrollLeft) main.scrollLeft = unit.x;
      else if (unit.x + axis.width > main.scrollLeft + main.clientWidth) main.scrollLeft = unit.x + axis.width - main.clientWidth;
      tree.grid.scrollTop = main.scrollTop;
      this.calFocus = { day: unit.first, minutes: null, event: null, resource: row.key, unit: unitIndex };
      this.tlPaintLanes();
      this.calRestoreFocus(true);
    },
    tlSelectUnit(unit, resource) {
      if (this.calZoom === "hour") {
        const minutes = this.calZone.parts(unit.start).minutes;
        this.calSelectSlots(unit.first, minutes, minutes + 60, resource);
      } else this.calSelectDays(unit.first, unit.last, resource);
    },
    calTimelineClick(event) {
      const lane = event.target.closest(".cx-tl-lane");
      if (!lane?.dataset.cxResource || !this.tlAxis) return false;
      const box = this.tlCanvas.getBoundingClientRect(), x = event.clientX - box.left, axis = this.tlAxis;
      const index = Math.max(0, Math.min(axis.units.length - 1, Math.floor(x / axis.width)));
      this.calFocus = { day: axis.units[index].first, minutes: null, event: null, resource: lane.dataset.cxResource, unit: index };
      this.tlSelectUnit(axis.units[index], lane.dataset.cxResource);
      this.calRestoreFocus(true);
      return true;
    },

    /** The drop target under a pointer: the instant, as a day and minutes, and the resource of the row under it. */
    calTimelinePoint(x, y) {
      const axis = this.tlAxis, tree = this.tlTree, box = this.tlCanvas.getBoundingClientRect();
      if (!axis || !tree) return null;
      const time = axis.time(Math.max(0, Math.min(axis.total, x - box.left))), offset = y - box.top, tops = tree.tops;
      // A binary search over the row tops: a drag asks this every frame.
      let low = 0, high = tree.rows.length - 1;
      while (low < high) { const mid = (low + high + 1) >> 1; if (tops[mid] <= offset) low = mid; else high = mid - 1; }
      const index = low;
      const row = tree.rows[index], resource = row && !row.status && !this.tl.children.has(row.key) ? row.key : null;
      const parts = this.calZone.parts(time);
      return { day: parts.day, minutes: parts.minutes + (time % CAL_MINUTE) / CAL_MINUTE, resource, time };
    },
    /** The snap of a timeline drag: the calendar's snap at hour zoom, an hour at day zoom, a day beyond. */
    tlSnap() { return this.calZoom === "hour" ? this.cal.editable.snap : this.calZoom === "day" ? Math.max(60, this.cal.editable.snap) : 1440; },
    calTimelineGhost(drag) {
      const proposal = drag.proposal, axis = this.tlAxis, lane = this.tlLanes?.get(proposal.resource ?? drag.event.resource);
      const ghost = this.calGhost ||= h("div", "cx-cal-ghost");
      ghost.className = "cx-cal-ghost cx-tl-ghost" + (drag.problem ? " cx-cal-conflict" : "");
      ghost.setAttribute("aria-hidden", "true");
      const label = this.calTimeText({ ...drag.event, start: proposal.start, end: proposal.end, sd: this.calZone.day(proposal.start), ed: this.calZone.day(Math.max(proposal.start, proposal.end - 1)) });
      // A bar a few pixels wide at day zoom cannot hold its text: the time and any reason sit in a label beside it.
      const text = ghost.querySelector(".cx-tl-ghost-label") || ghost.appendChild(h("span", "cx-tl-ghost-label"));
      if (ghost.firstChild !== text) ghost.replaceChildren(text);
      setText(text, drag.problem ? label + " · " + drag.problem : label); ghost.title = text.textContent;
      if (!lane) { ghost.remove(); return; }
      const x1 = axis.x(proposal.start), x2 = Math.max(x1 + 3, axis.x(proposal.end));
      ghost.style.left = x1 + "px"; ghost.style.width = (x2 - x1) + "px";
      if (ghost.parentNode !== lane) lane.appendChild(ghost);
    }
  });
