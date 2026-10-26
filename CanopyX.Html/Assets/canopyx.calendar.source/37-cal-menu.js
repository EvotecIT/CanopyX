  // ---------- calendar: context menus ----------
  // Right-click, a long press (the browser's contextmenu), Shift+F10 or the context-menu key on an event, a slot, a day or a
  // timeline cell opens a menu: Open and Move for an event, New event here for a slot or day (when creating is on), and the
  // items a host's calendar.menu(context, items) hook returns (or none, to keep the browser's own menu). Arrow keys, Home, End,
  // Enter and Escape work in it; focus comes back to where it opened.
  Object.assign(DataGrid.prototype, {
    /** What a menu is about: an event, or a slot, day or timeline cell with its day, minutes and resource. */
    calMenuContext(target, x) {
      const element = target.closest?.(".cx-cal-ev"), lane = !element && x != null && target.closest?.(".cx-tl-lane");
      // Timeline cells take no pointer events: a press on a lane finds its cell by the pointer's x.
      const cell = lane ? [...lane.querySelectorAll(".cx-tl-cell")].find(item => { const box = item.getBoundingClientRect(); return x >= box.left && x < box.right; }) : target.closest?.("[data-cx-day]");
      if (element?._calEvent) return { kind: "event", target: element, event: this.calPublicEvent(element._calEvent), raw: element._calEvent };
      if (!cell) return null;
      const minutes = cell.dataset.cxMinutes !== undefined ? Number(cell.dataset.cxMinutes) : null;
      return { kind: cell.classList.contains("cx-tl-cell") ? "resource" : minutes === null ? "day" : "slot", target: cell, day: calDayText(Number(cell.dataset.cxDay)), minutes, resource: this.calCellResource(cell) };
    },
    calMenuItems(context) {
      const labels = this.calLabels, items = [];
      if (context.kind === "event") {
        items.push({ id: "open", label: labels.calendarOpen, run: () => this.calOpenEvent(context.raw, true, context.target) });
        if (context.raw.recurring && this.cal.editable && this.cal.series?.editable && this.cal.recurrenceId?.editable && this.calCanEdit?.(context.raw, false))
          items.push({ id: "occurrence", label: labels.calendarEditOccurrence, run: () => this.editCalendarOccurrence(context.raw.id) });
        if (this.calStartMove && this.cal.editable && (this.calCanEdit(context.raw, false) || this.calCanEdit(context.raw, true))) items.push({ id: "move", label: labels.calendarMove, run: () => this.calStartMove(context.target) });
      } else if (this.cal.create && this.calCreateFromClick) {
        items.push({ id: "new", label: labels.calendarNewHere, run: () => this.calCreateFromClick(context.target) });
      }
      const hook = this.opts.calendar?.menu;
      if (typeof hook !== "function") return items;
      const own = { kind: context.kind, event: context.event, day: context.day, minutes: context.minutes, resource: context.resource };
      let result;
      try { result = hook(Object.freeze(own), items.map(({ id, label }) => Object.freeze({ id, label }))); } catch (error) { this.emit("error", { error }); return items; }
      if (result === null || result === false) return [];
      if (!Array.isArray(result)) return items;
      // Host items: text labels and run functions; a default kept by id keeps its own action.
      return result.slice(0, 30).map(item => {
        const kept = item && items.find(entry => entry.id === item.id && !item.run);
        if (kept) return kept;
        return item && typeof item.label === "string" && item.label.trim() && typeof item.run === "function" ? { id: item.id ?? null, label: item.label.slice(0, 200), run: () => item.run(Object.freeze(own)), disabled: item.disabled === true } : null;
      }).filter(Boolean);
    },
    /** Register one shared context binding for events, days, slots and timeline lanes. */
    calMenuStart() {
      if (!this.cal.menu) return;
      this.calMenuBinding = bindContextMenu(this.calBody, (event, element) => {
        const context = this.calMenuContext(element, event?.clientX);
        return context ? this.calMenuItems(context) : [];
      }, {
        host: this.host, closeOnFocusOutside: true,
        match: event => this.calMenuContext(event.target, event.type === "keydown" ? null : event.clientX)?.target,
        beforeOpen: (_event, element) => {
          if (this.destroyed || !this.cal.menu || this.calDrag?.started || this.calMoving || element.classList.contains("cx-cal-invalid")) return false;
          this.calHideHover();
        },
        label: (event, element) => {
          const context = this.calMenuContext(element, event?.clientX);
          const name = context.kind === "event" ? context.raw.title : context.kind === "resource" ?
            this.calResourceName?.(context.resource) ?? "" : this.calFmt.longDay(calParseDay(context.day));
          return fill(this.calLabels.calendarActions, { title: name });
        },
        onOpen: ({ menu }) => {
          this.calMenu = menu;
          document.dispatchEvent(new CustomEvent("canopyx:closemenus", { detail: { source: menu } }));
        },
        onClose: ({ menu }) => { if (this.calMenu === menu) this.calMenu = null; },
        onSelect: item => { Promise.resolve().then(() => item.run()).catch(error => this.emit("error", { error })); }
      });
      this.calMenuBinding.ready.catch(error => { if (!this.destroyed) this.emit("error", { error }); });
    }
  });
