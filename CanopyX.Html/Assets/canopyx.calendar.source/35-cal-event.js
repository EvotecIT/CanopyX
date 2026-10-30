  // ---------- calendar: drawing one event, its accessible name, opening its record and the "+N more" list ----------
  // An event is a button inside the day or slot it starts in. Its text is the record's text (never markup): the title, the
  // time, an optional subtitle and the status column drawn by its own presenter, so pills and tones match the grid. The
  // accessible name says title, time, status, resource and whether it repeats, so a long title that wraps or clips on screen
  // is always read in full. A host that wants its own content names a template (calendar renderers, docs/calendar.md),
  // which receives a fresh element and the record, as cell renderers do.
  const CAL_ROW_COPIES = new WeakMap();
  Object.assign(DataGrid.prototype, {
    /** The time of an occurrence in words: "09:00 â€“ 10:30", one time for a marker, nothing for an all-day event. */
    calTimeText(event, day) {
      if (event.allDay) return this.calLabels.calendarAllDay;
      const fmt = this.calFmt, labels = this.calLabels;
      if (event.marker) return fmt.time(event.start);
      if (day !== undefined && event.ed > event.sd) return day === event.sd ? fmt.time(event.start) : day === event.ed ? fmt.time(event.end) : labels.calendarAllDay;
      if (event.ed > event.sd) return fill(labels.calendarTimeRange, { start: fmt.shortDay(event.sd) + " " + fmt.time(event.start), end: fmt.shortDay(event.ed) + " " + fmt.time(event.end) });
      if (day !== undefined) return fmt.timeRange(event.start, event.end);
      return fill(labels.calendarTimeRange, { start: fmt.time(event.start), end: fmt.time(event.end) });
    },
    calStatusText(event) {
      const column = this.cal.status;
      return column ? cellText(event.row.cells[column.id], column, this.fmt) : "";
    },
    calEventName(event) {
      const parts = [event.title, event.allDay && event.ed > event.sd ? this.calFmt.dayRange(event.sd, event.ed) : this.calTimeText(event)];
      const status = this.calStatusText(event); if (status) parts.push(status);
      if (event.subtitle) parts.push(event.subtitle);
      if (this.calResourceName) parts.push(...this.calEventResources(event).map(id => this.calResourceName(id)));
      if (this.calEventResources(event).length > 1) parts.push(calCount(this, this.calLabels.calendarSharedResources, this.calEventResources(event).length, { resources: this.calLabels.calendarResources.toLocaleLowerCase(this.lang) }));
      if (event.recurring) parts.push(this.calLabels.calendarRepeats);
      return parts.filter(Boolean).join(", ");
    },

    /** Releases status resources in a replaced container, or the entire paint before repaint and grid destruction. */
    calDisposeEventRenderers(container) {
      const slots = this.calHostSlots;
      if (!container) this.calHostSlots = null;
      for (const slot of slots || []) if (!container || container.contains(slot.content)) { slots.delete(slot); disposeHostSlot(slot); }
    },

    /** A drawn event: kind is "bar" (a day row), "chip" (a month line), "block" (a time column), "item" (agenda) or "lane" (timeline). */
    calEventElement(event, kind, day) {
      const element = h("button", "cx-cal-ev cx-cal-ev-" + kind + (event.marker ? " cx-cal-marker" : "") + (event.allDay ? " cx-cal-allday" : ""));
      element.type = "button"; element.tabIndex = -1;
      element.dataset.cxEvent = event.id; element.dataset.cxRecord = event.key;
      element._calEvent = event;
      if (event.tone) { element.dataset.cxTone = event.tone; element.style.setProperty("--cx-ev", event.tone === "neutral" ? "var(--hfx-color-status-neutral-fg,var(--hfx-color-text-muted))" : toneVariable(event.tone, false, "var(--hfx-color-accent)")); element.style.setProperty("--cx-ev-bg", toneVariable(event.tone, true, "color-mix(in srgb,var(--cx-ev) 14%,var(--hfx-color-surface))")); }
      if (event.color) { element.style.setProperty("--cx-ev", event.color); element.style.setProperty("--cx-ev-bg", "color-mix(in srgb,var(--cx-ev) 14%,var(--hfx-color-surface))"); }
      element.setAttribute("aria-label", this.calEventName(event));
      const assignments = this.calEventResources(event);
      if (assignments.length > 1) {
        element.title = this.calEventName(event);
        const mark = (kind, on) => { this[kind] = on ? event.id : this[kind] === event.id ? null : this[kind];
          for (const card of this.calRoot.querySelectorAll(".cx-cal-ev")) card.classList.toggle("cx-cal-shared-active", card.dataset.cxEvent === this.calSharedHover || card.dataset.cxEvent === this.calSharedFocus); };
        element.addEventListener("pointerenter", () => mark("calSharedHover", true)); element.addEventListener("pointerleave", () => mark("calSharedHover", false));
        element.addEventListener("focus", () => mark("calSharedFocus", true)); element.addEventListener("blur", () => mark("calSharedFocus", false));
      }
      if (!event.base?.external && this.linkHighlight?.has(event.key)) element.dataset.cxLinked = "true";
      const template = this.opts.calendar?.render;
      if (typeof template === "function") {
        // One frozen copy per record object serves every paint of it.
        let copy = CAL_ROW_COPIES.get(event.row);
        if (copy?.version !== this.calVersion) { copy = { version: this.calVersion, row: gridFreeze(JSON.parse(JSON.stringify(event.row))) }; CAL_ROW_COPIES.set(event.row, copy); }
        const row = copy.row;
        try { if (template({ event: this.calPublicEvent(event), row, element, kind, labels: this.calLabels }) === true) return element; }
        catch (error) { this.emit("error", { error }); element.textContent = ""; }
      }
      const time = h("span", "cx-cal-ev-time"), title = h("span", "cx-cal-ev-title");
      if (!event.allDay && kind !== "bar" && kind !== "lane") { setText(time, kind === "item" ? this.calTimeText(event, day) : this.calFmt.time(event.start)); element.appendChild(time); }
      setText(title, event.title); element.appendChild(title);
      if (assignments.length > 1) { const shared = h("span", "cx-cal-shared"); setText(shared, calCount(this, this.calLabels.calendarSharedResources, assignments.length, { resources: this.calLabels.calendarResources.toLocaleLowerCase(this.lang) })); shared.setAttribute("aria-hidden", "true"); element.appendChild(shared); }
      if (kind === "block" || kind === "item" || kind === "lane") {
        if (event.subtitle) { const subtitle = h("span", "cx-cal-ev-sub"); setText(subtitle, event.subtitle); element.appendChild(subtitle); }
        const column = this.cal.status;
        if (column && (kind !== "lane") && cellValue(event.row.cells[column.id]) != null) {
          const statusClass = "cx-cal-ev-status" + (event.base?.toneFromStatus ? " cx-cal-status-tone" : "");
          let status = h("span", statusClass);
          let drawn = false;
          if (column.render) {
            const slot = { content: status }, context = new HostCellContext(slot, column.id, undefined, undefined, this.columns.indexOf(column));
            (this.calHostSlots ||= new Set()).add(slot);
            try { drawn = column.render(event.row, status, context) === true; }
            catch (error) { disposeHostSlot(slot); this.calHostSlots.delete(slot); status = h("span", statusClass); this.emit("error", { error }); }
          }
          if (!drawn) { const text = h("span"); setText(text, this.calStatusText(event)); status.appendChild(text); }
          element.appendChild(status);
        }
      }
      if (event.recurring) element.appendChild(calIcon("repeat"));
      return element;
    },
    calPublicEvent(event) {
      // source names the event's source; external marks an iCalendar event, whose record id is not a record of the grid.
      return gridFreeze({ id: event.id, record: event.key, start: calIso(event.start), end: calIso(event.end), allDay: event.allDay, title: event.title, resource: event.resource, recurring: event.recurring,
        resourceIds: this.calEventResources(event), source: event.base?.source ?? null, external: !!event.base?.external });
    },

    /** Opens an event's record: canopyx:rowActivate first (cancelable), then the host's onDetails or the record drawer. */
    async calOpenEvent(event, keyboard, returnFocus) {
      // An event of an iCalendar source has no record in the grid: it always shows its details.
      if (event.base?.external) return this.calShowDetails(event, this.calEventTarget(event.id, returnFocus) || returnFocus);
      const row = gridFreeze(JSON.parse(JSON.stringify(event.row)));
      if (!this.emit("rowActivate", { id: event.key, row, keyboard: !!keyboard, occurrence: event.recurring ? calIso(event.start) : null })) return;
      if (typeof this.opts.onDetails === "function")
        return this.runGridHook(signal => this.opts.onDetails({ row, query: this.acceptedQuery, signal, returnFocus, occurrence: event.recurring ? calIso(event.start) : null }), this.dataLifetime.signal);
      // A basic calendar shows a small details popover instead of the record drawer.
      if (this.cal.details === "popover") return this.calShowDetails(event, this.calEventTarget(event.id, returnFocus) || returnFocus);
      await this.requirePart("filter-editor");
      if (this.recordNeeded(event.row)) await this.loadRecordPanel();
      if (this.destroyed) return;
      const dialog = this.openGridDrawer(event.row, null, returnFocus);
      const id = event.id;
      dialog?.addEventListener("close", () => requestAnimationFrame(() => {
        if (this.destroyed || this.calRoot.contains(document.activeElement) || document.activeElement && document.activeElement !== document.body && document.activeElement !== this.grid) return;
        (this.calBody.querySelector('[data-cx-event="' + CSS.escape(id) + '"]') || this.calFocusTarget())?.focus({ preventScroll: true });
      }), { once: true });
      return dialog;
    },
    async openCalendarEvent(id) {
      const event = this.calEvents.find(item => item.id === id) || this.calEvents.find(item => item.key === id);
      if (!event) throw new Error("CanopyX: the calendar does not show event " + id + ".");
      return this.calOpenEvent(event, false, document.activeElement);
    },

    /** The "+N more" list of a day: a popover with every event of that day, arrow keys between them, Escape closes it. */
    calOpenMore(day, events, anchor) {
      this.calCloseMore();
      const labels = this.calLabels, panel = this.calMore = h("div", "cx-cal-more"), title = h("h3", "cx-cal-more-h"), list = h("div", "cx-cal-more-list");
      panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false");
      title.id = this.id + "-cal-more"; panel.setAttribute("aria-labelledby", title.id);
      setText(title, fill(labels.calendarDayEvents, { date: this.calFmt.longDay(day) }));
      const close = gridButton("", () => this.calCloseMore(true)); close.classList.add("cx-btn", "icon", "ghost", "cx-cal-more-close");
      close.setAttribute("aria-label", this.labels.gridCloseRecord); close.appendChild(gridIcon("close"));
      const head = h("div", "cx-cal-more-top"); head.append(title, close);
      for (const event of events) list.appendChild(this.calEventElement(event, "chip"));
      panel.append(head, list);
      panel._calAnchor = anchor;
      this.calRoot.appendChild(panel);
      const box = anchor.getBoundingClientRect(), frame = this.calRoot.getBoundingClientRect();
      const width = Math.min(300, frame.width - 16);
      panel.style.width = width + "px";
      panel.style.left = Math.max(8, Math.min(box.left - frame.left - 8, frame.width - width - 8)) + "px";
      panel.style.top = Math.max(8, Math.min(box.top - frame.top - 4, frame.height - panel.offsetHeight - 8)) + "px";
      panel.addEventListener("keydown", event => {
        const items = [...list.children], at = items.indexOf(document.activeElement);
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.calCloseMore(true); }
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); items[Math.max(0, Math.min(items.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)))]?.focus(); }
        else if (event.key === "Tab") { event.preventDefault(); (document.activeElement === close ? items[0] : close).focus(); }
      });
      panel.addEventListener("click", event => {
        const element = event.target.closest(".cx-cal-ev");
        if (element) this.calOpenEvent(element._calEvent, event.detail === 0, element).catch(error => this.emit("error", { error }));
      });
      this.calMoreOutside = event => { if (!panel.contains(event.target) && event.target !== anchor) this.calCloseMore(false); };
      document.addEventListener("pointerdown", this.calMoreOutside, true);
      (list.firstChild || close).focus();
      list.firstChild && (list.firstChild.tabIndex = 0);
    },
    calCloseMore(restore) {
      const panel = this.calMore;
      if (!panel) return;
      this.calMore = null; document.removeEventListener("pointerdown", this.calMoreOutside, true);
      panel.remove();
      if (restore && panel._calAnchor?.isConnected) panel._calAnchor.focus({ preventScroll: true });
    },

    /** Marks the events whose records another view highlights (linked views), and announces how many. */
    calMarkHighlights() {
      const keys = this.linkHighlight;
      let count = 0;
      for (const element of this.calBody.querySelectorAll(".cx-cal-ev")) {
        const on = !element._calEvent?.base?.external && !!keys?.has(element.dataset.cxRecord);
        if (on) count++;
        if (on) element.dataset.cxLinked = "true"; else delete element.dataset.cxLinked;
      }
      this.host.classList.toggle("cx-cal-has-linked", !!keys?.size);
      if (keys?.size) this.calAnnounce(calCount(this, this.calLabels.calendarHighlighted, count));
    }
  });
