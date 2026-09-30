
  // ---------- tree grid: cell navigation ----------
  // The cell half of the ARIA tree grid pattern, for rows whose cells hold controls (links, buttons, checkboxes a host
  // renderer drew, or the controls of a detail row). Row focus stays the default: Right on a row that cannot open
  // further, or F2 on any row, moves focus into its first cell with a control. There Left and Right move between the
  // cells (and between the controls of one cell), Up and Down keep the column in the rows above and below, Home and
  // End go to the first and last cell, and Escape, F2, or Left from the first cell return to the row. A cell whose
  // control is a button or a link focuses the control; a control that needs the arrow keys (a text box, a list, radio
  // buttons, tabs) is entered with Enter from its cell and left with Escape. Controls in cells and detail rows are not
  // Tab stops: the grid stays one stop in the page's tab order.
  const CELL_CONTROLS = "a[href],button,input,select,textarea,summary,[tabindex],[contenteditable]:not([contenteditable=false])," +
    "[role=button],[role=checkbox],[role=radio],[role=link],[role=switch],[role=tab],[role=menuitem],[role=textbox],[role=combobox]";
  // Controls that use the arrow keys themselves, and a scrolling detail body, whose arrow keys scroll it.
  const OWN_ARROWS = ".cx-detail-body,textarea,select,[contenteditable]:not([contenteditable=false]),[aria-activedescendant]," +
    "[role=textbox],[role=combobox],[role=spinbutton],[role=slider],[role=radio],[role=tab],[role=menuitem],[role=listbox],[role=tree],[role=grid]," +
    "input:not([type=button]):not([type=checkbox]):not([type=submit]):not([type=reset]):not([type=image]):not([type=file]):not([type=color])";

  /** Whether a control can take focus from the keyboard: enabled, shown, not inert, not hidden from assistive technology. */
  function reachable(control) {
    return !control.matches(":disabled") && !control.closest("[inert],[aria-hidden=true]") &&
      (control.checkVisibility ? control.checkVisibility({ visibilityProperty: true }) : control.getClientRects().length > 0);
  }

  /**
   * The controls in a cell a keyboard can reach, in document order. The body of a detail row that scrolls comes last,
   * as a region the arrow keys scroll.
   */
  function cellControls(cell) {
    const controls = Array.prototype.filter.call(cell.querySelectorAll(CELL_CONTROLS), (control) =>
      !control.classList.contains("cx-detail-body") && reachable(control));
    const body = cell.querySelector(":scope > .cx-detail-body");
    if (body && (body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1)) controls.push(body);
    return controls;
  }

  /** Takes the controls of a cell out of the Tab order; cell navigation reaches them instead. */
  function quietControls(cell) {
    cell.querySelectorAll(CELL_CONTROLS).forEach((control) => {
      if (control.tabIndex >= 0) control.tabIndex = -1;
    });
  }

  Object.assign(TreeGrid.prototype, {
    /** The cells of a row, in column order: the visible cells of a node row, the body cell of a detail row. */
    rowCells(rowEl) {
      return rowEl && rowEl._cells && rowEl._kind !== "status" ? rowEl._cells.map((slot) => slot.cell) : [];
    },

    /** Moves focus into the first cell of a row that holds a control; false when the row has none. */
    enterCells(w) {
      const cells = this.rowCells(this.rendered.get(w));
      const index = cells.findIndex((cell) => cellControls(cell).length > 0);
      if (index < 0) return false;
      this.focusCell(w, index, 0);
      return true;
    },

    /**
     * Focuses a cell of a row. control is the position of one of its controls (-1 for the last), null for the cell
     * itself, or undefined for its control when it has exactly one and the cell otherwise. A control that uses the
     * arrow keys is entered only with enter set (Enter on its cell); arrows stop at its cell. The row becomes the
     * focused row, so it stays rendered and keeps the grid's tab stop.
     */
    focusCell(w, index, control, enter) {
      this.setFocus(w, false);
      const cells = this.rowCells(this.rendered.get(w));
      if (!cells.length) {
        this.setFocus(w, true);
        return;
      }
      const cell = cells[Math.max(0, Math.min(cells.length - 1, index))];
      const controls = cellControls(cell);
      let target = cell;
      if (typeof control === "number" && controls.length) target = controls[control < 0 ? controls.length - 1 : Math.min(control, controls.length - 1)];
      else if (control === undefined && controls.length === 1) target = controls[0];
      // Focus that stops at the cell of an arrow-using control stands for that control: Enter goes into it, and Left
      // and Right go on from it.
      let parked = -1;
      if (target !== cell && !enter && !target.classList.contains("cx-detail-body") && target.matches(OWN_ARROWS)) {
        parked = controls.indexOf(target);
        target = cell;
      }
      cell._cxAt = parked;
      if (target === cell) cell.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      this.revealInRow(cell, target, cells[0]);
    },

    /**
     * Scrolls a focused cell into the grid's visible width, clear of a pinned tree column, and a control into view
     * inside a detail body that scrolls. Rows are already in view; the page itself does not move.
     */
    revealInRow(cell, target, treeCell) {
      const grid = this.grid;
      if (cell.parentNode && cell.parentNode._kind === "node") {
        this.revealInCell(cell, target);
        const pinned = cell !== treeCell && this.host.classList.contains("cx-pin-tree") ? treeCell.offsetWidth : 0;
        const left = grid.getBoundingClientRect().left + grid.clientLeft;
        const box = cell.getBoundingClientRect();
        if (box.left < left + pinned) grid.scrollLeft -= left + pinned - box.left;
        else if (box.right > left + grid.clientWidth) grid.scrollLeft += Math.min(box.right - left - grid.clientWidth, box.left - left - pinned);
      }
      const body = target.closest(".cx-detail-body");
      if (body && body !== target) {
        const outer = body.getBoundingClientRect();
        const inner = target.getBoundingClientRect();
        if (inner.top < outer.top) body.scrollTop -= outer.top - inner.top;
        else if (inner.bottom > outer.bottom) body.scrollTop += Math.min(inner.bottom - outer.bottom, inner.top - outer.top);
      }
      // A control in a detail taller than the grid can lie outside the rows the grid shows, below the header.
      const frame = grid.getBoundingClientRect();
      const top = frame.top + grid.clientTop + this.head.offsetHeight;
      const bottom = frame.top + grid.clientTop + grid.clientHeight;
      const box = target.getBoundingClientRect();
      if (box.top < top) grid.scrollTop -= top - box.top;
      else if (box.bottom > bottom) grid.scrollTop += Math.min(box.bottom - bottom, box.top - top);
    },

    /**
     * Scrolls a control that the cell clips (cells hide what does not fit their width) into view inside the cell. The
     * cell scrolls back to its start once focus leaves it (see the focusout handler in 40-render.js), so the row it
     * shows next, or the same row without focus, starts at its first content.
     */
    revealInCell(cell, target) {
      // Only the cells of node rows clip; a detail row's cell shows all of its body.
      if (target === cell || !cell.contains(target) || !cell.parentNode || cell.parentNode._kind !== "node") return;
      const outer = cell.getBoundingClientRect();
      const inner = target.getBoundingClientRect();
      const start = outer.left + cell.clientLeft;
      const end = start + cell.clientWidth;
      if (inner.left < start) cell.scrollLeft -= start - inner.left;
      else if (inner.right > end) cell.scrollLeft += Math.min(inner.right - end, inner.left - start);
      if (cell.scrollLeft) this.scrolledCell = cell;
    },

    /** Scrolls a cell that revealInCell scrolled back to its start, once focus is no longer inside it. */
    settleCell(next) {
      const cell = this.scrolledCell;
      // Without a next element, focus may only have left the window: the control keeps it, and the cell its scroll.
      if (cell && !cell.contains(next || document.activeElement)) {
        cell.scrollLeft = 0;
        this.scrolledCell = null;
      }
    },

    /**
     * Shift+Tab from a cell or a control in a row goes where it goes from the row: before the grid. The row, the
     * grid's tab stop, comes before its cells in document order and would take the step; it is skipped once.
     */
    skipRowTabStop(rowEl) {
      if (rowEl.tabIndex < 0) return;
      rowEl.tabIndex = -1;
      // The browser moves focus right after this keydown; the row is the tab stop again after that.
      setTimeout(() => {
        if (!this.destroyed && rowEl._tab === 0) rowEl.tabIndex = 0;
      }, 0);
    },

    /** Where focus is inside a rendered row's cells, so a repaint that replaces the cell can put it back. */
    heldCell() {
      const active = document.activeElement;
      const rowEl = active && active.closest ? active.closest(".cx-row") : null;
      if (!rowEl || rowEl === active || !rowEl._w || !this.canvas.contains(rowEl)) return null;
      const cells = this.rowCells(rowEl);
      const index = cells.findIndex((cell) => cell.contains(active));
      if (index < 0) return null;
      // Only the raw position here, as this runs on every render pass; restoreCell resolves it when it is needed.
      return { w: rowEl._w, index: index, control: active === cells[index] ? -1 : Array.prototype.indexOf.call(cells[index].querySelectorAll(CELL_CONTROLS), active) };
    },

    /** Puts focus back into the cell it was in when a repaint took the focused element away. */
    restoreCell(held) {
      const active = document.activeElement;
      if (!held || this.destroyed || (active && active !== document.body) || !this.rendered.has(held.w)) return;
      // The row is rendered and in place already: focus only, without another render pass.
      const cell = this.rowCells(this.rendered.get(held.w))[held.index];
      if (!cell) return;
      const candidate = held.control >= 0 ? cell.querySelectorAll(CELL_CONTROLS)[held.control] : null;
      const target = candidate && reachable(candidate) ? candidate : cell;
      if (target === cell) cell.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      this.revealInCell(cell, target);
    },

    /**
     * Handles a key pressed while focus is in a cell. Returns true when the key was handled here or belongs to the
     * control that has focus, false when the row's keys apply (paging, type-ahead).
     */
    onCellKey(e) {
      const rowEl = e.target.closest(".cx-row");
      const w = rowEl && rowEl._w;
      const cells = this.rowCells(rowEl);
      const index = cells.findIndex((cell) => cell.contains(e.target));
      if (!w || w.status || index < 0 || e.isComposing || e.defaultPrevented) return index >= 0;
      const cell = cells[index];
      const control = e.target !== cell ? e.target : null;
      if (control && control.matches(OWN_ARROWS)) {
        if (e.key !== "Escape") return true;
        // The cell stands for the control it came from, as when the arrows stopped there on the way in.
        const from = cellControls(cell).indexOf(control);
        this.focusCell(w, index, null);
        cell._cxAt = from;
        e.preventDefault();
        e.stopPropagation();
        return true;
      }
      const controls = cellControls(cell);
      // On the cell itself: the control it stands for, when focus stopped there on the way to one.
      const at = control ? controls.indexOf(control) : cell._cxAt >= 0 && cell._cxAt < controls.length ? cell._cxAt : -1;
      const detail = rowEl._kind === "detail";
      switch (e.key) {
        case "ArrowRight":
          if (at >= 0 && at < controls.length - 1) this.focusCell(w, index, at + 1);
          else if (!detail && index < cells.length - 1) this.focusCell(w, index + 1, 0);
          break;
        case "ArrowLeft":
          if (at > 0) this.focusCell(w, index, at - 1);
          else if (!detail && index > 0) this.focusCell(w, index - 1, -1);
          else this.setFocus(w, true);
          break;
        case "Home":
          this.focusCell(w, 0, 0);
          break;
        case "End":
          this.focusCell(w, cells.length - 1, -1);
          break;
        case "ArrowUp":
        case "ArrowDown": {
          const next = this.rows[this.indexOf(w) + (e.key === "ArrowUp" ? -1 : 1)];
          if (!next) break;
          // A column goes on in a node row; a status or detail row, or leaving a detail, takes row focus.
          if (!detail && !next.status && !next.h.detail) this.focusCell(next, index);
          else this.setFocus(next, true);
          break;
        }
        case "Escape":
        case "F2":
          this.setFocus(w, true);
          break;
        case "Enter":
        case " ":
          // A control acts on its own keys; Enter on a cell with controls goes into the first one (also one that uses
          // the arrow keys), and a plain cell acts as its row does.
          if (control) return true;
          if (e.key === "Enter" && controls.length) this.focusCell(w, index, Math.max(0, at), true);
          else this.activate(w, e.key === "Enter");
          break;
        default:
          return !!control;
      }
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
  });
