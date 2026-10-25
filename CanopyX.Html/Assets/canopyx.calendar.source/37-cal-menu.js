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
    /** Opens the menu for a target at a point (a pointer) or beside it (the keyboard). True when a menu opened. */
    calOpenMenu(target, x, y) {
      if (!this.cal.menu) return false;
      const context = this.calMenuContext(target, x);
      if (context?.target.classList.contains("cx-cal-invalid")) return false;
      if (!context) return false;
      const items = this.calMenuItems(context);
      if (!items.length) return false;
      this.calCloseMenu(false); this.calHideHover();
      const menu = this.calMenu = h("div", "cx-cal-menu"), name = context.kind === "event" ? context.raw.title : context.kind === "resource" ? this.calResourceName?.(context.resource) ?? "" : this.calFmt.longDay(calParseDay(context.day));
      menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", fill(this.calLabels.calendarActions, { title: name }));
      const buttons = items.map(item => {
        const button = h("button", "cx-cal-menu-item"); button.type = "button"; button.setAttribute("role", "menuitem"); button.tabIndex = -1; setText(button, item.label);
        if (item.disabled) button.setAttribute("aria-disabled", "true");
        // Focus goes back to where the menu opened first; an item that moves focus (Move, a host's dialog) takes it from there.
        button.addEventListener("click", () => { if (item.disabled) return; this.calCloseMenu(true); Promise.resolve().then(() => item.run()).catch(error => this.emit("error", { error })); });
        menu.appendChild(button); return button;
      });
      menu._calReturn = target;
      // The context-menu key raises contextmenu where focus went: on the menu, which keeps the browser's own menu away.
      menu.addEventListener("contextmenu", event => event.preventDefault());
      this.calRoot.appendChild(menu);
      const frame = this.calRoot.getBoundingClientRect(), box = target.getBoundingClientRect(), width = menu.offsetWidth, height = menu.offsetHeight;
      const left = x != null ? x - frame.left : box.left - frame.left + Math.min(box.width, 24), top = y != null ? y - frame.top : box.top - frame.top + Math.min(box.height, 24);
      menu.style.left = Math.max(4, Math.min(left, frame.width - width - 4)) + "px"; menu.style.top = Math.max(4, Math.min(top, frame.height - height - 4)) + "px";
      menu.addEventListener("keydown", key => {
        const at = buttons.indexOf(document.activeElement);
        if (key.key === "Escape" || key.key === "Tab") { key.preventDefault(); key.stopPropagation(); this.calCloseMenu(true); }
        else if (key.key === "ArrowDown") { key.preventDefault(); buttons[(at + 1) % buttons.length].focus(); }
        else if (key.key === "ArrowUp") { key.preventDefault(); buttons[(at + buttons.length - 1) % buttons.length].focus(); }
        else if (key.key === "Home") { key.preventDefault(); buttons[0].focus(); }
        else if (key.key === "End") { key.preventDefault(); buttons[buttons.length - 1].focus(); }
      });
      this.calMenuOutside = press => { if (!menu.contains(press.target)) this.calCloseMenu(false); };
      document.addEventListener("pointerdown", this.calMenuOutside, true);
      buttons[0].focus({ preventScroll: true });
      return true;
    },
    calCloseMenu(restore) {
      const menu = this.calMenu;
      if (!menu) return;
      this.calMenu = null; document.removeEventListener("pointerdown", this.calMenuOutside, true);
      menu.remove();
      if (restore && menu._calReturn?.isConnected) menu._calReturn.focus({ preventScroll: true });
    },
    /** Pointer and keyboard ways into the menu (core start). A touch long press opens it where the browser does not. */
    calMenuStart() {
      if (!this.cal.menu) return;
      const body = this.calBody, signal = this.lifetime.signal;
      let press = null;
      const cancel = () => { if (press) { clearTimeout(press.timer); press = null; this.calPressTimer = 0; } };
      body.addEventListener("contextmenu", event => {
        cancel();
        // The context-menu key raises this event after its keydown opened the menu.
        if (this.calMenu && Date.now() - (this.calMenuOpenedAt || 0) < 800) { event.preventDefault(); return; }
        if (event.shiftKey || this.calDrag?.started || this.calMoving) return;
        const keyboard = event.button !== 2 && event.clientX === 0 && event.clientY === 0;
        if (this.calOpenMenu(event.target, keyboard ? null : event.clientX, keyboard ? null : event.clientY)) { event.preventDefault(); this.calMenuOpenedAt = Date.now(); }
      }, { signal });
      body.addEventListener("pointerdown", event => {
        cancel();
        // A long press swallows the click it ends with; the next press starts afresh.
        if (this.calPressSuppress) { this.calPressSuppress = false; this.calSuppressClick = false; }
        if (event.pointerType !== "touch") return;
        press = { x: event.clientX, y: event.clientY, target: event.target, timer: setTimeout(() => {
          const at = press; press = null;
          if (at && !this.calDrag?.started && Date.now() - (this.calMenuOpenedAt || 0) > 800 && this.calOpenMenu(at.target, at.x, at.y)) { this.calMenuOpenedAt = Date.now(); this.calSuppressClick = true; this.calPressSuppress = true; }
        }, 600) };
        this.calPressTimer = press.timer;
      }, { signal, passive: true });
      body.addEventListener("pointermove", event => { if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) cancel(); }, { signal, passive: true });
      for (const type of ["pointerup", "pointercancel", "scroll"]) body.addEventListener(type, cancel, { signal, passive: true, capture: type === "scroll" });
    },
    /** Shift+F10 or the context-menu key on an event, slot, day or timeline cell (from calKey). */
    calMenuKey(event) {
      if (!this.cal.menu || !(event.key === "ContextMenu" || event.key === "F10" && event.shiftKey)) return false;
      if (!this.calOpenMenu(event.target)) return false;
      event.preventDefault(); this.calMenuOpenedAt = Date.now();
      return true;
    }
  });
