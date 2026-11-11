  // ---------- row actions: the cells, the More menu and the status line ----------
  // A cell holds a labelled group of icon buttons. Cell navigation reaches them (Enter enters the cell, Left and Right
  // move between buttons) and the grid stays one Tab stop. A disabled action keeps its button, marked aria-disabled with
  // its reason as the description, so the keyboard still finds it. The More button and a right-click, Shift+F10, the
  // Menu key or a long press on a row open the shared menu: More lists the actions that did not fit, the context menu
  // all of them. A cell repainted while one of its buttons had focus gives focus back to the same action.
  Object.assign(DataGrid.prototype, {
    startRowActions() {
      this.rowActions = rowActionSettings(this.view.rowActions, new Map(this.view.columns.map(column => [column.id, column])));
      this.rowActionText = Object.fromEntries(Object.entries(ROW_ACTION_TEXT).map(([key, text]) => [key, this.labels[key] || text]));
      const timeout = this.opts.interactionTimeoutMs ?? 30000, signal = this.lifetime.signal;
      if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_PROTOCOL_INTEGER) throw new Error("CanopyX: interactionTimeoutMs must be a positive protocol integer.");
      for (const name of ["onRowAction", "isRowActionEnabled"]) if (this.opts[name] != null && typeof this.opts[name] !== "function") throw new Error("CanopyX: " + name + " must be a function.");
      this.rowActionTimeout = timeout; this.rowActionPending = new Map(); this.rowActionResults = new Map();
      this.host.setAttribute("data-cx-row-actions", this.rowActions.reveal);
      const status = this.rowActionStatus = h("div", "cx-ra-status"), text = h("span", "cx-ra-status-text"), dismiss = h("button", "cx-btn");
      status.setAttribute("role", "alert"); status.hidden = true; dismiss.type = "button"; dismiss.dataset.variant = "ghost"; dismiss.dataset.size = "sm"; dismiss.dataset.icon = "";
      dismiss.setAttribute("aria-label", this.rowActionText.rowActionDismiss); dismiss.appendChild(rowActionIcon("close"));
      dismiss.addEventListener("click", () => this.showRowActionStatus(null), { signal });
      status.append(text, dismiss); this.grid.before(status);
      this.canvas.addEventListener("click", event => {
        const button = event.target.closest("[data-cx-row-action]"), element = button && event.target.closest(".cx-row");
        if (!element?._w || element._w.status) return;
        event.preventDefault();
        if (button.getAttribute("aria-disabled") === "true") return;
        const id = element._w.key, reason = event.detail === 0 ? "keyboard" : "pointer";
        if (button.dataset.cxRowAction === "") this.openRowActionMenu(element, button, true);
        else this.requestRowAction(id, button.dataset.cxRowAction, { reason }).catch(error => this.emit("error", { error }));
      }, { signal });
      this.canvas.addEventListener("focusin", event => {
        const button = event.target.closest("[data-cx-row-action]"), element = button && button.closest(".cx-row");
        this.rowActionFocus = element?._w ? { id: element._w.key, action: button.dataset.cxRowAction } : null;
      }, { signal });
      // Focus that leaves the rows for somewhere else is not given back by a later repaint.
      this.canvas.addEventListener("focusout", event => { if (event.relatedTarget && !this.canvas.contains(event.relatedTarget)) this.rowActionFocus = null; }, { signal });
      document.addEventListener("pointerdown", event => { if (!this.canvas.contains(event.target)) this.rowActionFocus = null; }, { signal, capture: true });
      this.rowActionMenu = UI_IMPL.contextMenu(this.canvas, (_event, element) => this.rowActionItems(element), {
        host: this.host, label: () => this.columns.find(column => column.rowActions)?.title,
        match: event => {
          const element = event.target.closest(".cx-row");
          return element?._w && !element._w.status && this.canvas.contains(element) && !event.target.closest("a,input,select,textarea,[contenteditable]") ? element : null;
        },
        anchor: () => this.rowActionAnchor || null,
        renderIcon: name => rowActionIcon(name),
        onOpen: () => this.rowActionAnchor?.setAttribute("aria-expanded", "true"),
        onClose: () => { this.rowActionAnchor?.setAttribute("aria-expanded", "false"); this.rowActionAnchor = null; },
        onSelect: (item, event) => {
          const id = this.rowActionMenuRow;
          if (id != null) this.requestRowAction(id, item.id, { reason: event?.detail === 0 ? "keyboard" : "menu" }).catch(error => this.emit("error", { error }));
        }
      });
      signal.addEventListener("abort", () => { this.rowActionMenu(); this.cancelRowAction(); status.remove(); this.host.removeAttribute("data-cx-row-actions"); }, { once: true });
      this.version++; this.scheduleRender();
    },
    /** The menu's entries for a row: the More button's overflow, or every action the row offers. */
    rowActionItems(element) {
      const row = element._w, more = !!this.rowActionAnchor;
      if (!row || row.status) return [];
      const state = this.rowActionState(row.h);
      this.rowActionMenuRow = row.key;
      return (more ? state.more : state.all).map(({ action, disabled }) => ({ id: action.id, label: action.label, icon: action.icon, disabled, danger: action.tone === "danger" }));
    },
    openRowActionMenu(element, button) {
      this.rowActionAnchor = button;
      if (!this.rowActionMenu.open(null, element, { keyboard: true })) this.rowActionAnchor = null;
    },
    paintRowActions(row, cell) {
      if (!this.rowActions) return false;
      const state = this.rowActionState(row), labels = this.rowActionText, group = h("div", "cx-ra");
      cell.classList.add("cx-row-actions-cell"); cell.appendChild(group);
      if (state.locked) {
        const lock = h("span", "cx-ra-lock"), label = this.rowActions.lockedLabel || labels.rowActionLocked;
        lock.setAttribute("role", "img"); lock.setAttribute("aria-label", label); lock.title = label; lock.appendChild(rowActionIcon("lock"));
        group.appendChild(lock); return true;
      }
      group.setAttribute("role", "group"); group.setAttribute("aria-label", this.columns.find(column => column.rowActions)?.title || labels.rowActionColumn);
      const result = this.rowActionResults.get(row.id), button = (id, label, icon, disabled) => {
        const control = h("button", "cx-btn cx-ra-btn"); control.type = "button"; control.dataset.variant = "ghost"; control.dataset.size = "sm"; control.dataset.icon = "";
        control.dataset.cxRowAction = id; control.setAttribute("aria-label", label); control.title = label; control.appendChild(icon);
        if (disabled) control.setAttribute("aria-disabled", "true");
        group.appendChild(control); return control;
      };
      for (const { action, disabled, reason } of state.inline) {
        const control = button(action.id, action.label, rowActionIcon(action.icon), disabled);
        if (action.tone !== "neutral") control.dataset.tone = action.tone;
        const busy = state.pending?.action === action, note = busy ? fill(labels.rowActionPending, { action: action.label }) : reason || (result?.action === action ? result.message : null);
        if (busy) { control.setAttribute("aria-busy", "true"); control.dataset.cxState = "busy"; }
        else if (result?.action === action) control.dataset.cxState = "rejected";
        if (note) { control.setAttribute("aria-description", note); control.title = action.label + " — " + note; }
      }
      if (state.more.length) {
        const more = button("", labels.rowActionMore, gridIcon("more"), false);
        more.setAttribute("aria-haspopup", "menu"); more.setAttribute("aria-expanded", "false");
        if (state.pending && state.more.some(entry => entry.action === state.pending.action)) { more.setAttribute("aria-busy", "true"); more.dataset.cxState = "busy"; }
      }
      const focus = this.rowActionFocus, active = document.activeElement;
      if (focus?.id === row.id && (!active || active === document.body || !active.isConnected))
        queueMicrotask(() => { if (cell.isConnected && (document.activeElement === document.body || !document.activeElement)) cell.querySelector("[data-cx-row-action=\"" + CSS.escape(focus.action) + "\"]")?.focus({ preventScroll: true }); });
      return true;
    },
    /** Shows or clears the visible status line above the rows; role alert announces it. */
    showRowActionStatus(message) {
      const status = this.rowActionStatus;
      if (!status) return;
      setText(status.firstChild, message || ""); status.hidden = !message;
    }
  });
