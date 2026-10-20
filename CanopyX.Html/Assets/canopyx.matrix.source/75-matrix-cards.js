  // ---------- matrix: phone cards and the print table ----------
  // A matrix that asks for cards (phone: "cards") reads as a card per row on screens of 640 pixels and narrower: the row's
  // total and the cells that need attention, a hundred cards at a time. Printing draws a plain table of the visible matrix,
  // or, past 2,500 cells, the list of cells that need attention, as CanopyX.Html's static output does.
  const MATRIX_GLYPHS = { check: "✓", cross: "✕", warning: "!", info: "i", dot: "•", dash: "–", question: "?", clock: "◷", pause: "‖" };
  Object.assign(MatrixView.prototype, {
    attentionCells(row) {
      const cells = [];
      for (const column of this.model.columns) {
        const info = this.model.cell(row, column);
        if (info.state < MATRIX_SELF && this.doc.attention[info.state]) cells.push({ column, info, state: this.doc.states[info.state] });
      }
      return cells;
    },
    renderCards() {
      const labels = this.labels, list = h("ul", "cx-mx-cardlist"), limit = this.cardLimit ||= 100, rows = this.model.rows.filter(entry => entry.kind !== "heading");
      let group = null;
      for (const entry of rows.slice(0, limit)) {
        // Grouped rows keep their group's name above its cards.
        if (entry.band && entry.band !== group) { group = entry.band; const heading = h("li", "cx-mx-cardgroup"); setText(heading, group.label); list.appendChild(heading); }
        const card = h("li", "cx-mx-card"), head = h("div", "cx-mx-cardhead"), title = h("span", "cx-mx-label"), total = h("span", "cx-mx-total" + (entry.total ? "" : " cx-mx-zero"));
        setText(title, entry.label); setText(total, this.format.format(entry.total || 0));
        total.setAttribute("aria-label", fill(labels.matrixItemTotal, { item: entry.label, count: this.format.format(entry.total || 0) }));
        head.append(title, total); card.appendChild(head);
        if (entry.kind === "item" && entry.item.secondary) { const sub = h("div", "cx-mx-sub"); setText(sub, entry.item.secondary); card.appendChild(sub); }
        const cells = this.attentionCells(entry), items = h("ul", "cx-mx-cardcells");
        for (const { column, info, state } of cells.slice(0, 12)) {
          const item = h("li", "cx-mx-cardcell"), swatch = h("span", "cx-mx-swatch cx-mx-attn"), text = h("span");
          applyTone(swatch, swatch.className, toneOf(state.tone));
          const symbol = matrixSymbol(state.symbol); if (symbol) swatch.appendChild(symbol);
          const note = info.note, extra = note && note.text ? note.text : note && note.value != null ? this.format.format(note.value) : "";
          setText(text, column.label + " · " + state.label + (extra ? " · " + extra : ""));
          item.append(swatch, text); items.appendChild(item);
        }
        if (cells.length > 12) { const more = h("li", "cx-mx-sub"); setText(more, "+" + this.format.format(cells.length - 12)); items.appendChild(more); }
        if (!cells.length) { const clear = h("div", "cx-mx-sub cx-mx-clear-text"); setText(clear, labels.matrixAllClear); card.appendChild(clear); } else card.appendChild(items);
        list.appendChild(card);
      }
      const children = [list];
      if (rows.length > limit) {
        const more = h("button", "cx-mx-button"); more.type = "button"; setText(more, labels.matrixShowMore);
        more.addEventListener("click", () => { this.cardLimit += 100; this.renderCards(); }, { signal: this.lifetime.signal });
        children.push(more);
      }
      this.cards.replaceChildren(...children);
    },
    stateGlyph(info) {
      if (info.state === MATRIX_SELF) return "";
      if (info.state === MATRIX_NONE) return "";
      const state = this.doc.states[info.state];
      return (MATRIX_GLYPHS[state.symbol] || "") + (info.note && info.note.text ? " " + info.note.text : info.note && info.note.value != null ? " " + this.format.format(info.note.value) : "");
    },
    renderPrint() {
      if (this.destroyed) return;
      const model = this.model, labels = this.labels, table = h("table", "cx-mx-printtable"), caption = h("caption");
      setText(caption, this.doc.label + " — " + this.summaryText()); table.appendChild(caption);
      const columns = model.columns, rows = model.rows.filter(entry => entry.kind !== "heading");
      if (rows.length * columns.length <= 2500) {
        const head = h("tr"), corner = h("th"); head.appendChild(corner);
        for (const column of columns) { const th = h("th"); th.scope = "col"; setText(th, column.label); head.appendChild(th); }
        if (this.totalW) { const th = h("th"); setText(th, labels.matrixTotal); head.appendChild(th); }
        table.appendChild(head);
        for (const row of rows) {
          const tr = h("tr"), th = h("th"); th.scope = "row"; setText(th, row.label); tr.appendChild(th);
          for (const column of columns) {
            const info = model.cell(row, column), td = h("td"), state = info.state < MATRIX_SELF ? this.doc.states[info.state] : null;
            setText(td, this.stateGlyph(info)); td.title = state ? state.label : info.state === MATRIX_SELF ? labels.matrixSelf : labels.matrixNoData;
            if (state && state.attention) td.className = "cx-mx-printattn"; tr.appendChild(td);
          }
          if (this.totalW) { const td = h("td"); setText(td, this.format.format(row.total || 0)); tr.appendChild(td); }
          table.appendChild(tr);
        }
      } else {
        const head = h("tr");
        for (const text of [this.axisTitle("rows"), this.axisTitle("columns"), labels.matrixState, labels.matrixValue]) { const th = h("th"); th.scope = "col"; setText(th, text); head.appendChild(th); }
        table.appendChild(head);
        let written = 0, left = 0;
        for (const row of rows) {
          for (const { column, info, state } of this.attentionCells(row)) {
            if (written >= 5000) { left++; continue; }
            written++;
            const tr = h("tr");
            for (const text of [row.label, column.label, state.label, info.note && (info.note.text || (info.note.value != null ? this.format.format(info.note.value) : "")) || ""]) { const td = h("td"); setText(td, text); tr.appendChild(td); }
            table.appendChild(tr);
          }
        }
        if (left) { const tr = h("tr"), td = h("td"); td.colSpan = 4; setText(td, "+" + this.format.format(left)); tr.appendChild(td); table.appendChild(tr); }
      }
      this.print.replaceChildren(table);
    }
  });
