  // ---------- matrix: a cell's tooltip, its event and its details dialog ----------
  // Hover (after a short pause) or keyboard focus shows a tooltip with both items, the state, the value and the details.
  // Click or Enter raises canopyx:matrixCell (cancelable); unless the host handles it, or the matrix says details "host",
  // a dialog lists the same and returns focus to the cell when it closes. CanopyX never acts on the cell itself.
  Object.assign(MatrixView.prototype, {
    cellInfo(cell) {
      const row = this.model.rows[cell._r], column = this.model.columns[cell._c];
      if (!row || !column) return null;
      const info = this.model.cell(row, column), state = info.state < MATRIX_SELF ? this.doc.states[info.state] : null;
      return { row, column, info, state };
    },
    cellLines(data) {
      const labels = this.labels, lines = [], note = data.info.note;
      const stateText = data.state ? data.state.label : data.info.state === MATRIX_SELF ? labels.matrixSelf : labels.matrixNoData;
      lines.push([labels.matrixState, stateText]);
      if (note && note.value != null) lines.push([labels.matrixValue, this.format.format(note.value)]);
      if (note && note.text) lines.push([note.value != null ? "" : labels.matrixValue, note.text]);
      if (data.info.rolled) {
        lines.push(["", fill(labels.matrixCellCount, { count: this.format.format(data.info.members) })]);
        if (data.info.attention) lines.push(["", fill(labels.matrixAttention, { count: this.format.format(data.info.attention) })]);
      }
      if (note && note.title) lines.push(["", note.title]);
      for (const [label, value] of note && note.details || []) lines.push([label, value]);
      return lines;
    },
    onPointer(event) {
      const target = this.cellAt(event);
      if (target && this.pointerCell && target._r === this.pointerCell._r && target._c === this.pointerCell._c) return;
      this.pointerCell = target; this.hoverCell(target);
      clearTimeout(this.tipTimer);
      if (!target) { if (!this.tipKeyboard) this.hideTip(); return; }
      this.tipTimer = setTimeout(() => { if (!this.destroyed && this.pointerCell === target) this.showTip(target, false); }, 250);
    },
    showTip(cell, keyboard) {
      const data = this.cellInfo(cell);
      if (!data) return;
      this.tipKeyboard = keyboard;
      const tip = this.tip, title = h("div", "cx-mx-tiptitle"), list = h("dl", "cx-mx-tiplist");
      setText(title, data.row.label + " · " + data.column.label);
      for (const [label, value] of this.cellLines(data).slice(0, 8)) {
        const term = h("dt"), text = h("dd"); setText(term, label); setText(text, value); list.append(term, text);
      }
      tip.replaceChildren(title, list); tip.hidden = false;
      const box = this.cellRect(cell._r, cell._c), frame = this.root.getBoundingClientRect(), width = tip.offsetWidth, height = tip.offsetHeight;
      if (!box) { this.hideTip(); return; }
      let left = box.left - frame.left + box.width / 2 - width / 2, top = box.bottom - frame.top + 6;
      left = Math.max(4, Math.min(left, frame.width - width - 4));
      if (box.bottom + height + 10 > global.innerHeight && box.top - height - 6 > 0) top = box.top - frame.top - height - 6;
      tip.style.left = left + "px"; tip.style.top = top + "px";
    },
    hideTip() { clearTimeout(this.tipTimer); this.tip.hidden = true; this.tipKeyboard = false; this.pointerCell = null; this.hoverElement?.remove(); },
    openCell(cell) {
      const data = this.cellInfo(cell);
      if (!data) return;
      this.hideTip();
      const note = data.info.note, member = entry => entry.kind === "item" ? entry.item.id : null, group = entry => entry.kind === "item" ? null : entry.group.key;
      const detail = Object.freeze({ matrix: this.doc.id, row: member(data.row), rowGroup: group(data.row), column: member(data.column), columnGroup: group(data.column),
        state: data.state ? data.state.id : data.info.state === MATRIX_SELF ? "self" : null, value: note ? note.value : null, text: note ? note.text : null,
        title: note ? note.title : null, details: note && note.details ? note.details.map(pair => [...pair]) : [], members: data.info.members, attention: data.info.attention });
      if (!this.emit("matrixCell", detail, "onCell", true) || this.doc.details === "host") return;
      this.openDialog(data, cell);
    },
    openDialog(data, cell) {
      const labels = this.labels, dialog = this.dialog ||= this.buildDialog();
      setText(dialog._title, data.row.label + " · " + data.column.label);
      const rows = [];
      for (const [label, value] of this.cellLines(data)) {
        const term = h("dt"), text = h("dd"); setText(term, label); setText(text, value); rows.push(term, text);
      }
      dialog._list.replaceChildren(...rows);
      const state = data.state, badge = dialog._state;
      badge.replaceChildren(); applyTone(badge, "cx-mx-swatch" + (state && state.attention ? " cx-mx-attn" : ""), toneOf(state ? state.tone : null));
      const symbol = state && matrixSymbol(state.symbol); if (symbol) badge.appendChild(symbol);
      setText(dialog._close, labels.matrixClose);
      if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
      dialog._close.focus();
    },
    buildDialog() {
      const dialog = h("dialog", "cx-mx-dialog"), head = h("div", "cx-mx-dialoghead"), title = h("h2", "cx-mx-dialogtitle"), state = h("span", "cx-mx-swatch"), list = h("dl", "cx-mx-details");
      const close = h("button", "cx-btn cx-mx-button"), signal = this.lifetime.signal;
      title.id = (this.host.id || "cx-matrix") + "-" + Math.random().toString(36).slice(2) + "-title";
      dialog.setAttribute("aria-labelledby", title.id); close.type = "button";
      close.addEventListener("click", () => dialog.close ? dialog.close() : dialog.removeAttribute("open"), { signal });
      dialog.addEventListener("close", () => { if (!this.destroyed) this.moveTo(this.focus.row, this.focus.column, true, false); }, { signal });
      head.append(state, title); dialog.append(head, list, close);
      dialog._title = title; dialog._list = list; dialog._close = close; dialog._state = state;
      this.root.appendChild(dialog);
      return dialog;
    }
  });
