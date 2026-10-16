  // ---------- calendar: dropping items from outside ----------
  // With drop on, the calendar accepts rows dragged out of a CanopyX grid whose view says dragRows, and any element marked with
  // data-canopyx-event (JSON text: { title, minutes?, allDay?, cells? }) made draggable by the page. A ghost shows where the item
  // would go, checked as creating is (the valid range, unavailable time). The drop raises the cancelable canopyx:eventReceive
  // (and onReceive) with the item and its place; unless a host takes it, the item becomes a new record through the editing
  // contract (insertRow, then commit unless commit is manual). From the keyboard: F2 on a grid row picks it up, Enter on a
  // calendar slot or day drops it there.
  const CAL_DROP_TYPES = ["application/x-canopyx-row", "application/x-canopyx-event"];
  let calDropElement = null;
  /** The item a data-canopyx-event element describes, or null: text values only, length-checked, never markup. */
  function calElementItem(element) {
    let data;
    try { data = JSON.parse(element.getAttribute("data-canopyx-event") || "{}"); } catch { return null; }
    if (!data || typeof data !== "object" || typeof data.title !== "string" || !data.title.trim() || data.title.length > 1000) return null;
    const minutes = Number.isInteger(data.minutes) && data.minutes >= 5 && data.minutes <= 10080 ? data.minutes : null, cells = Object.create(null);
    if (data.cells && typeof data.cells === "object" && !Array.isArray(data.cells))
      for (const [id, value] of Object.entries(data.cells)) if (value === null || ["string", "number", "boolean"].includes(typeof value)) cells[id] = value;
    return Object.freeze({ source: "element", id: typeof data.id === "string" ? data.id : null, title: data.title.trim(), minutes, allDay: data.allDay === true, cells: Object.freeze(cells) });
  }
  if (typeof document !== "undefined") {
    // Page elements marked for the calendar carry their item while they are dragged.
    document.addEventListener("dragstart", event => {
      // A new drag starts afresh: a row whose drag ended out of sight (its element gone) leaves nothing behind.
      GRID_DRAG.item = null;
      // Only an element the page marked and made draggable carries an item, never a link or image dragged from inside one.
      const element = event.target.closest?.("[data-canopyx-event]");
      calDropElement = element && element.getAttribute("draggable") === "true" ? calElementItem(element) : null;
      if (calDropElement) { event.dataTransfer.setData("application/x-canopyx-event", JSON.stringify(calDropElement)); event.dataTransfer.setData("text/plain", calDropElement.title); event.dataTransfer.effectAllowed = "copyMove"; }
    }, true);
    document.addEventListener("dragend", () => { calDropElement = null; }, true);
  }

  Object.assign(DataGrid.prototype, {
    /** Listeners of a calendar that accepts drops (core calendar hook, once it starts). */
    calEditStart() {
      if (!this.cal.drop) return;
      const body = this.calBody, signal = this.lifetime.signal;
      body.addEventListener("dragover", event => this.calDropOver(event), { signal });
      body.addEventListener("dragleave", event => { if (!body.contains(event.relatedTarget)) this.calDropClear(); }, { signal });
      body.addEventListener("drop", event => this.calDropOn(event), { signal });
    },
    /** The item in flight: a grid row (dragged or picked up), or a page element. */
    calDropItem(picked) { return picked ? GRID_DRAG.picked : GRID_DRAG.item || calDropElement; },
    /** Where an item would land at a point (or a cell): its proposal, or null outside the calendar's slots and days. */
    calDropProposal(item, point) {
      if (!point) return null;
      const cal = this.cal, zone = this.calZone, minutes = item.minutes ?? cal.create?.minutes ?? 60, resource = cal.resource?.editable ? point.resource ?? null : null, row = point.row ?? null;
      if (point.minutes == null || item.allDay) {
        // An all-day item or a day becomes an all-day event only where the calendar stores all-day events; else a timed one.
        if (cal.allDay?.editable) return { start: point.day * CAL_DAY, end: (point.day + 1) * CAL_DAY, allDay: true, resource, row };
        if (point.minutes == null) { const at = cal.working?.start ?? 540; return { start: zone.instant(point.day, at), end: zone.instant(point.day, at + minutes), allDay: false, resource, row }; }
      }
      const snap = this.calView === "timeline" ? this.tlSnap() : cal.editable?.snap ?? cal.slotMinutes, at = Math.floor(point.minutes / snap) * snap;
      return { start: zone.instant(point.day, at), end: zone.instant(point.day, at + minutes), allDay: false, resource, row };
    },
    calDropOver(event) {
      const types = [...event.dataTransfer.types];
      if (!CAL_DROP_TYPES.some(type => types.includes(type))) return;
      const item = this.calDropItem(false);
      if (!item || this.editReadOnly) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      const proposal = this.calDropProposal(item, this.calPointAt(event.clientX, event.clientY));
      if (!proposal) { this.calDropClear(); return; }
      const drag = this.calDropDrag = { drop: true, event: { title: item.title, allDay: proposal.allDay, start: proposal.start, end: proposal.end, resource: proposal.resource, marker: false }, proposal,
        problem: this.calCreateProblem(proposal) };
      this.calDrawGhost(drag);
    },
    calDropClear() { this.calDropDrag = null; this.calGhost?.remove(); this.calGhost = null; },
    calDropOn(event) {
      // Only drags that started in this page count: another page's data in the drag is never read.
      const item = this.calDropItem(false);
      const proposal = item && this.calDropProposal(item, this.calPointAt(event.clientX, event.clientY));
      this.calDropClear();
      if (!item || !proposal) return;
      event.preventDefault();
      GRID_DRAG.item = null; calDropElement = null;
      this.calReceive(item, proposal).catch(error => this.emit("error", { error }));
    },
    /** Enter on a slot or day drops the row picked up in a grid, Escape puts it down (core calendar hook); true when handled. */
    calDropFromKey(event, cell) {
      if (this.cal.drop && event.key === "Escape" && GRID_DRAG.picked) { GRID_DRAG.picked = null; event.preventDefault(); return true; }
      if (!this.cal.drop || event.key !== "Enter" || !GRID_DRAG.picked || !cell || this.editReadOnly) return false;
      event.preventDefault();
      const item = GRID_DRAG.picked, point = { day: Number(cell.dataset.cxDay), minutes: cell.dataset.cxMinutes !== undefined ? Number(cell.dataset.cxMinutes) : null, resource: this.calCellResource(cell) };
      GRID_DRAG.picked = null;
      this.calReceive(item, this.calDropProposal(item, point)).catch(error => this.emit("error", { error }));
      return true;
    },
    /** Schedules a dropped item: the checks, canopyx:eventReceive (cancelable), then a new record. */
    async calReceive(item, proposal) {
      if (this.editReadOnly) return false;
      const problem = this.calCreateProblem(proposal);
      if (problem) { this.calAnnounce(problem); this.calNotice(problem, true, true); return false; }
      const detail = { item, start: calIso(proposal.start), end: calIso(proposal.end), allDay: proposal.allDay, resource: proposal.resource };
      let go = this.emit("eventReceive", detail);
      if (go && typeof this.opts.onReceive === "function") { try { go = this.opts.onReceive(detail) !== false; } catch (error) { this.emit("error", { error }); go = false; } }
      if (!go) return false;
      // The record takes the item's values for this grid's own columns, never its identity or the calendar's time columns.
      const cal = this.cal, own = new Set(this.columns.map(column => column.id)), skip = new Set([cal.start.id, cal.end?.id, cal.allDay?.id, cal.title.id, cal.recurrence?.id, cal.exceptions?.id, cal.series?.id, cal.recurrenceId?.id, cal.seriesEnd?.id].filter(Boolean)), extra = {};
      for (const [id, value] of Object.entries(item.cells || {})) if (own.has(id) && !skip.has(id)) extra[id] = value;
      const done = await this.calInsertEvent(proposal, item.title, extra);
      if (done) {
        const time = this.calFmt.shortDay(proposal.allDay ? Math.floor(proposal.start / CAL_DAY) : this.calZone.day(proposal.start)) + (proposal.allDay ? "" : " " + this.calFmt.time(proposal.start));
        this.calAnnounce(fill(this.calLabels.calendarReceived, { title: item.title, time }));
      }
      return done;
    }
  });
