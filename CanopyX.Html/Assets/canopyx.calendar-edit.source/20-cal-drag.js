  // ---------- calendar: dragging and the keyboard move mode ----------
  // A press on an editable event that travels four pixels starts a drag: in the middle it moves the event, on the bottom edge
  // of a time block (or the end of a bar) it changes the end, on the top edge the start. The proposal follows the pointer once
  // per frame, snapped to snapMinutes (days in the month and all-day rows), drawn as a ghost that says the new time and turns
  // red with the reason when the drop would be refused. F2 on a focused editable event starts the same thing from the keyboard:
  // arrows move it (by snap or by day), Shift with arrows changes its end, Alt with Up or Down changes its resource, Enter saves
  // and Escape cancels.
  const CAL_DRAG_START = 4, CAL_EDGE = 6;

  Object.assign(DataGrid.prototype, {
    calDragStart(pointer) {
      const element = pointer.target.closest(".cx-cal-ev"), event = element?._calEvent;
      // A press on empty slots or days may become a range to create.
      if (!element) { this.calRangeStart(pointer); return; }
      if (!event || pointer.button !== 0 || !this.calCanEdit(event, false) && !this.calCanEdit(event, true)) return;
      const box = element.getBoundingClientRect(), block = element.classList.contains("cx-cal-ev-block"), lane = element.classList.contains("cx-cal-ev-lane");
      const vertical = block, rtl = this.calRtl, edge = vertical ? box.bottom - pointer.clientY : rtl ? pointer.clientX - box.left : box.right - pointer.clientX, top = vertical ? pointer.clientY - box.top : rtl ? box.right - pointer.clientX : pointer.clientX - box.left;
      const mode = edge <= CAL_EDGE && this.calCanEdit(event, true) && !event.marker ? "end" : top <= CAL_EDGE && (vertical || lane) && this.calCanEdit(event, true) && !event.marker ? "start" : this.calCanEdit(event, false) ? "move" : null;
      if (!mode) return;
      const origin = this.calPointAt(pointer.clientX, pointer.clientY);
      if (!origin) return;
      this.calDrag = { event, element, mode, origin, x: pointer.clientX, y: pointer.clientY, id: pointer.pointerId, started: false, proposal: null };
      element.setPointerCapture?.(pointer.pointerId);
    },
    calDragMove(pointer) {
      if (this.calCreateDrag) { this.calRangeMove(pointer); return; }
      const drag = this.calDrag;
      if (!drag || pointer.pointerId !== drag.id) return;
      if (drag.cancelled) { pointer.preventDefault(); return; }
      if (!drag.started && Math.hypot(pointer.clientX - drag.x, pointer.clientY - drag.y) < CAL_DRAG_START) return;
      if (!drag.started) { drag.started = true; drag.element.classList.add("cx-cal-dragging"); this.host.classList.add("cx-cal-drag"); }
      pointer.preventDefault();
      drag.lastX = pointer.clientX; drag.lastY = pointer.clientY;
      if (drag.frame) return;
      drag.frame = requestAnimationFrame(() => {
        drag.frame = 0;
        const point = this.calPointAt(drag.lastX, drag.lastY);
        if (point) this.calPropose(drag, point);
      });
    },
    async calDragEnd(pointer, cancel) {
      if (this.calCreateDrag) { this.calRangeEnd(pointer, cancel); return; }
      const drag = this.calDrag;
      if (!drag || pointer && pointer.pointerId !== drag.id) return;
      if (cancel) this.calCancelGesture();
      // A release can precede the queued preview frame: commit the last pointer position, not the previous preview.
      if (!drag.cancelled && drag.started && drag.frame) {
        const point = this.calPointAt(drag.lastX, drag.lastY);
        if (point) this.calPropose(drag, point);
      }
      this.calDrag = null; cancelAnimationFrame(drag.frame);
      drag.element.classList.remove("cx-cal-dragging"); this.host.classList.remove("cx-cal-drag");
      this.calGhost?.remove(); this.calGhost = null;
      if (!drag.started && !drag.cancelled) return;
      this.calSuppressClick = true; setTimeout(() => { this.calSuppressClick = false; }, 0);
      if (cancel || drag.cancelled || !drag.proposal) return;
      if (drag.problem) { this.calAnnounce(drag.problem); return; }
      await this.calApply(drag.event, drag.proposal).catch(error => this.emit("error", { error }));
    },

    /** Cancels the preview now; matching pointer release still consumes the gesture's trailing click. */
    calCancelGesture() {
      const drag = this.calDrag, range = this.calCreateDrag;
      if (!drag && !range) return false;
      if (drag) {
        drag.cancelled = true; cancelAnimationFrame(drag.frame); drag.frame = 0;
        drag.element.classList.remove("cx-cal-dragging"); this.host.classList.remove("cx-cal-drag");
      }
      if (range && !range.cancelled) { range.cancelled = true; this.calSelection = range.selection; this.calMarkSelection(); }
      this.calGhost?.remove(); this.calGhost = null;
      return true;
    },

    /** Where a pointer is in the current view: { day, minutes (null for whole days), resource }. */
    calPointAt(x, y) {
      if (this.calView === "timeline") return this.calTimelinePoint?.(x, y) || null;
      const target = document.elementFromPoint(x, y)?.closest?.("[data-cx-day]");
      if (calDayGrid(this.calView) || !this.calScroller) return target?.dataset.cxDay ? { day: Number(target.dataset.cxDay), minutes: null, resource: target.dataset.cxResource ?? null } : null;
      const slots = this.calScroller.firstChild, box = slots.getBoundingClientRect(), cal = this.cal;
      if (target?.classList.contains("cx-cal-allcell")) return { day: Number(target.dataset.cxDay), minutes: null, resource: target.dataset.cxResource ?? null, allDayRow: true };
      const columns = [...this.calGrid.querySelectorAll(".cx-cal-allcell")], width = (box.width - CAL_GUTTER) / columns.length;
      const index = Math.max(0, Math.min(columns.length - 1, Math.floor(((this.calRtl ? box.right - x : x - box.left) - CAL_GUTTER) / width)));
      const minutes = Math.max(cal.minMinutes, Math.min(cal.maxMinutes, cal.minMinutes + (y - box.top) / (CAL_SLOT_PX / cal.slotMinutes)));
      return { day: Number(columns[index].dataset.cxDay), minutes, resource: columns[index].dataset.cxResource ?? null, column: index };
    },
    /** The proposal a drag or a key gives: new start, end and resource, checked, and drawn as the ghost. */
    calPropose(drag, point) {
      const event = drag.event, zone = event.allDay ? calZone("utc") : this.calZone, snap = this.calView === "timeline" ? this.tlSnap() : this.cal.editable?.snap ?? this.cal.slotMinutes, origin = drag.origin;
      const snapped = minutes => Math.round(minutes / snap) * snap;
      let start = event.start, end = event.end;
      const timed = point.minutes != null && origin.minutes != null && !event.allDay;
      if (drag.mode === "move") {
        if (timed) {
          const offset = snapped(point.minutes - origin.minutes), startParts = zone.parts(event.start);
          start = zone.instant(startParts.day + (point.day - origin.day), startParts.minutes + offset);
        } else { const startParts = zone.parts(event.start); start = zone.instant(startParts.day + (point.day - origin.day), startParts.minutes); }
        end = start + (event.end - event.start);
      } else if (drag.mode === "end") {
        end = timed ? zone.instant(point.day, snapped(point.minutes)) : event.allDay ? zone.start(point.day + 1) : zone.instant(point.day, zone.parts(event.end).minutes);
        end = Math.max(end, start + (event.allDay ? CAL_DAY : snap * CAL_MINUTE));
      } else {
        start = timed ? zone.instant(point.day, snapped(point.minutes)) : event.allDay ? zone.start(point.day) : zone.instant(point.day, zone.parts(event.start).minutes);
        start = Math.min(start, end - (event.allDay ? CAL_DAY : snap * CAL_MINUTE));
      }
      const resource = drag.mode === "move" && this.cal.editable.resources && point.resource != null ? point.resource : event.resource;
      drag.proposal = { start, end, resource, allDay: event.allDay };
      drag.problem = this.calCheck(event, drag.proposal);
      this.calDrawGhost(drag);
    },
    calDrawGhost(drag) {
      const proposal = drag.proposal, event = drag.event;
      if (this.calView === "timeline") { this.calTimelineGhost?.(drag); return; }
      const ghost = this.calGhost ||= h("div", "cx-cal-ghost");
      ghost.setAttribute("aria-hidden", "true");
      ghost.classList.toggle("cx-cal-conflict", !!drag.problem);
      // A dropped item is named on its ghost; a moved event is already in view under it.
      const label = (drag.drop ? event.title + " · " : "") + this.calTimeText({ ...event, start: proposal.start, end: proposal.end, sd: this.calZone.day(proposal.start), ed: this.calZone.day(Math.max(proposal.start, proposal.end - 1)) });
      setText(ghost, drag.problem ? label + " · " + drag.problem : label);
      ghost.title = ghost.textContent;
      const sd = event.allDay ? Math.floor(proposal.start / CAL_DAY) : this.calZone.day(proposal.start);
      const cell = this.calBody.querySelector('.cx-cal-day[data-cx-day="' + sd + '"],.cx-cal-allcell[data-cx-day="' + sd + '"]' + (proposal.resource != null && !calDayGrid(this.calView) ? '[data-cx-resource="' + CSS.escape(proposal.resource) + '"]' : ""));
      if (!calDayGrid(this.calView) && !calInAllDayRow(event) && this.calScroller) {
        const slots = this.calScroller.firstChild, columns = [...this.calGrid.querySelectorAll(".cx-cal-allcell")];
        const index = columns.findIndex(item => Number(item.dataset.cxDay) === sd && (proposal.resource == null || item.dataset.cxResource === undefined || item.dataset.cxResource === proposal.resource));
        // A resource on another page of the phone's resource columns has no column here: no ghost, the announcement names it.
        if (index < 0) { ghost.remove(); return; }
        const top = this.calZone.parts(proposal.start).minutes - this.cal.minMinutes, length = Math.max(this.calMinSegment, (proposal.end - proposal.start) / CAL_MINUTE);
        ghost.className = "cx-cal-ghost cx-cal-ghost-block" + (drag.problem ? " cx-cal-conflict" : "");
        ghost.style.setProperty("--d", String(Math.max(0, index))); ghost.style.setProperty("--t", String(top)); ghost.style.setProperty("--h", String(length));
        if (ghost.parentNode !== slots) slots.appendChild(ghost);
      } else if (cell) {
        const days = Math.max(1, Math.round((proposal.end - proposal.start) / CAL_DAY));
        ghost.className = "cx-cal-ghost cx-cal-ghost-bar" + (drag.problem ? " cx-cal-conflict" : "");
        ghost.style.setProperty("--s", String(days));
        ghost.style.setProperty("--c", String([...cell.parentNode.children].filter(item => item.matches(".cx-cal-day,.cx-cal-allcell")).indexOf(cell)));
        if (ghost.parentNode !== cell) cell.appendChild(ghost);
      }
    },

    /** The keyboard move mode on a focused editable event; true when it handled the key. */
    calEditKey(key) {
      if (key.key === "Escape") {
        const gesture = this.calCancelGesture(), drop = this.calCancelDrop?.();
        if (gesture || drop) { this.calStopMoving(); key.preventDefault(); return true; }
      }
      const target = key.target.closest?.(".cx-cal-ev"), moving = this.calMoving;
      if (!moving) {
        if (key.key !== "F2" || !target?._calEvent || !this.calCanEdit(target._calEvent, false) && !this.calCanEdit(target._calEvent, true)) return false;
        key.preventDefault();
        return this.calStartMove(target);
      }
      return this.calMoveKey(key, moving);
    },
    /** Starts the keyboard move mode on an event element (F2, or Move in its context menu). */
    calStartMove(target) {
      {
        const event = target._calEvent;
        if (!event || !this.calCanEdit(event, false) && !this.calCanEdit(event, true)) return false;
        this.calMoving = { event, element: target, mode: "move", origin: { day: event.sd, minutes: 0 }, proposal: { start: event.start, end: event.end, resource: event.resource, allDay: event.allDay } };
        target.classList.add("cx-cal-dragging"); this.calAnnounce(this.calLabels.calendarMoveHelp);
        // Focus leaving the event (a click elsewhere, a repaint) ends the move mode.
        this.calMoving.blur = () => this.calStopMoving(); target.addEventListener("blur", this.calMoving.blur);
        target.focus({ preventScroll: true });
        return true;
      }
    },
    calMoveKey(key, moving) {
      const event = moving.event, proposal = moving.proposal, timeView = !calDayGrid(this.calView) && this.calView !== "timeline" && !calInAllDayRow(event);
      const zone = event.allDay ? calZone("utc") : this.calZone, step = this.cal.editable.snap * CAL_MINUTE;
      // Whole days move in wall-clock terms, so a step over a DST change keeps the time of day.
      const days = (time, count) => zone.instant(zone.day(time) + count, zone.parts(time).minutes + (time % CAL_MINUTE) / CAL_MINUTE);
      let start = proposal.start, end = proposal.end, resource = proposal.resource;
      if (key.key === "Escape") { key.preventDefault(); this.calStopMoving(); return true; }
      if (key.key === "Enter") {
        key.preventDefault();
        const proposalNow = moving.proposal, problem = moving.problem; this.calStopMoving();
        if (problem) this.calAnnounce(problem); else this.calApply(event, proposalNow).catch(error => this.emit("error", { error }));
        return true;
      }
      const vertical = key.key === "ArrowUp" || key.key === "ArrowDown", horizontal = key.key === "ArrowLeft" || key.key === "ArrowRight";
      if (["Shift", "Alt", "Control", "Meta"].includes(key.key)) return true;
      // Any other key (Tab, Ctrl+Z) ends the move mode without a change and does what it does.
      if (!vertical && !horizontal) { this.calStopMoving(); return false; }
      key.preventDefault();
      const sign = key.key === "ArrowUp" || key.key === "ArrowLeft" ? -1 : 1;
      if (key.altKey && vertical && this.cal.editable.resources && this.calResourceStep) resource = this.calResourceStep(resource, sign);
      else if (key.shiftKey && this.calCanEdit(event, true)) end = Math.max(start + (event.allDay ? CAL_DAY : step), timeView && vertical ? end + sign * step : days(end, sign));
      else if (timeView && vertical) { start += sign * step; end += sign * step; }
      else { const count = sign * (vertical ? 7 : 1), length = end - start; start = days(start, count); end = event.allDay ? days(end, count) : start + length; }
      moving.proposal = { start, end, resource, allDay: event.allDay };
      moving.problem = this.calCheck(event, moving.proposal);
      this.calDrawGhost(moving);
      const named = resource != null && resource !== event.resource && this.calResourceName ? ", " + this.calResourceName(resource) : "";
      this.calAnnounce(this.calTimeText({ ...event, start, end, sd: this.calZone.day(start), ed: this.calZone.day(Math.max(start, end - 1)) }) + named + (moving.problem ? ", " + moving.problem : ""));
      return true;
    },
    calStopMoving() {
      const moving = this.calMoving;
      if (!moving) return;
      this.calMoving = null; moving.element.classList.remove("cx-cal-dragging"); moving.element.removeEventListener("blur", moving.blur);
      this.calGhost?.remove(); this.calGhost = null;
    }
  });
