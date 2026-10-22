  // ---------- matrix: cells drawn on a canvas per row; one focusable cell element carries the grid semantics ----------
  // Measured on the 400 by 400 benchmark, a node per cell kept scrolling busy creating and styling hundreds of cells per step
  // (tests/browser/bench/matrix-benchmark.mjs). Each mounted row therefore draws the window of columns on its own canvas, which
  // scrolls with the row natively. The colours, fonts and symbols come from the stylesheet through hidden probes, so themes,
  // host tones and forced colours apply. The cell that has focus is a real gridcell element over the canvas, with its name,
  // index and tab stop; hover and click find their cell from the pointer.
  const MATRIX_PATHS = new Map(), MATRIX_TILE = 16;
  function matrixPath(name) {
    if (!MATRIX_PATHS.has(name)) MATRIX_PATHS.set(name, name === "dot" ? null : new Path2D(MATRIX_SYMBOL_PATHS[name]));
    return MATRIX_PATHS.get(name);
  }
  Object.assign(MatrixView.prototype, {
    /** How each state draws: its name, symbol, ink, fill and font, read from the stylesheet once per theme and derive. */
    looks() {
      if (this.lookCache && this.lookCache.doc === this.doc) return this.lookCache.items;
      const items = new Map(), probe = h("span", "cx-mx-cell"), forced = global.matchMedia?.("(forced-colors: active)").matches;
      probe.style.display = "none"; this.root.appendChild(probe);
      const read = (cls, tone) => {
        probe.className = cls; toneColors(probe, tone);
        const style = getComputedStyle(probe), fill = style.backgroundColor;
        return { ink: style.color, fill: /rgba\(\d+, \d+, \d+, 0\)|transparent/.test(fill) ? null : fill, font: style.fontWeight + " " + style.fontSize + " " + style.fontFamily };
      };
      this.doc.states.forEach((state, index) => {
        const tone = toneOf(state.tone), look = read("cx-mx-cell" + (state.attention ? " cx-mx-attn" : "") + tone.cls, tone);
        items.set(index, Object.assign(look, { symbol: state.symbol, name: state.label, attention: state.attention, forced }));
      });
      items.set(MATRIX_NONE, Object.assign(read("cx-mx-cell cx-mx-none", toneOf(null)), { symbol: null, name: this.labels.matrixNoData, none: true }));
      items.set(MATRIX_SELF, Object.assign(read("cx-mx-cell cx-mx-self", toneOf(null)), { symbol: null, name: this.labels.matrixSelf, self: true }));
      probe.className = "cx-mx-gridline"; this.lineColor = getComputedStyle(probe).color;
      probe.remove();
      this.lookCache = { doc: this.doc, items };
      this.cellName = matrixTemplate(this.labels.matrixCell);
      this.canvasVersion = (this.canvasVersion || 0) + 1;
      return items;
    },
    /** Mounts the tiles of a row that meet the window of columns and draws those not yet drawn for this row, theme and ratio. */
    drawRow(row, entry, first, last) {
      // Refreshing the palette advances its version; the first row must compare against that new version too.
      this.looks();
      const ratio = global.devicePixelRatio || 1, tiles = row._tiles ||= new Map(), version = this.canvasVersion + ":" + ratio + ":" + entry.key;
      const from = last >= first ? Math.floor(first / MATRIX_TILE) : 0, to = last >= first ? Math.floor(last / MATRIX_TILE) : -1;
      for (const [index, tile] of tiles) if (index < from || index > to) { tiles.delete(index); tile.remove(); if (this.tilePool.length < 400) this.tilePool.push(tile); }
      for (let index = from; index <= to; index++) {
        let tile = tiles.get(index);
        if (!tile) {
          tile = this.tilePool.pop();
          if (!tile) { tile = h("canvas", "cx-mx-canvas"); tile.setAttribute("aria-hidden", "true"); }
          tile._drawn = null; tiles.set(index, tile); row.insertBefore(tile, row._total);
        }
        if (tile._drawn !== version) { this.drawTile(tile, entry, index, ratio); tile._drawn = version; }
      }
    },
    drawTile(canvas, entry, index, ratio) {
      const looks = this.lookCache.items, cellW = this.cellW, height = this.rowH - 1, columns = this.model.columns;
      const first = index * MATRIX_TILE, last = Math.min(columns.length - 1, first + MATRIX_TILE - 1), width = (last - first + 1) * cellW;
      const pixelsW = Math.ceil(width * ratio), pixelsH = Math.ceil(height * ratio);
      if (canvas.width !== pixelsW || canvas.height !== pixelsH) { canvas.width = pixelsW; canvas.height = pixelsH; canvas.style.width = width + "px"; canvas.style.height = height + "px"; }
      canvas.style.insetInlineStart = this.rowHeadW + this.columnWindow.offset(first) + "px";
      const ctx = canvas.getContext("2d"), rtl = this.rtl;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
      ctx.textBaseline = "middle";
      for (let c = first; c <= last; c++) {
        const info = this.model.cell(entry, columns[c]), look = looks.get(info.state), x = rtl ? width - (c - first + 1) * cellW : (c - first) * cellW;
        if (look.self) {
          // A self cell is hatched and carries no state.
          ctx.save(); ctx.beginPath(); ctx.rect(x, 0, cellW, height); ctx.clip(); ctx.beginPath();
          for (let d = -height; d < cellW; d += 5) { ctx.moveTo(x + d, height); ctx.lineTo(x + d + height, 0); }
          ctx.strokeStyle = this.lineColor; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
        } else if (look.none) {
          // A cell without data shows a faint dot, quieter than the hatch, so a sparse matrix reads as drawn, not unfinished.
          ctx.fillStyle = look.ink; ctx.beginPath(); ctx.arc(x + cellW / 2, height / 2, 1.25, 0, Math.PI * 2); ctx.fill();
        } else if (look.fill) {
          ctx.fillStyle = look.fill; ctx.fillRect(x, 0, cellW, height);
          if (look.forced) { ctx.strokeStyle = look.ink; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, 1.5, cellW - 3, height - 3); }
        }
        if (info.rolled) { ctx.strokeStyle = this.lineColor; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, 0.5, cellW - 2, height - 1); }
        const note = info.note, shown = note && note.text != null ? note.text : note && note.value != null ? this.format.format(note.value) : info.rolled && info.attention ? this.format.format(info.attention) : "";
        let textWidth = 0;
        if (shown) {
          ctx.font = look.font;
          const cacheKey = look.font + "\u0000" + shown, widths = this.textWidths ||= new Map();
          if (!widths.has(cacheKey)) { if (widths.size > 4000) widths.clear(); widths.set(cacheKey, ctx.measureText(shown).width); }
          textWidth = widths.get(cacheKey);
          if (look.symbol && textWidth + 18 > cellW - 4) textWidth = -1;
        }
        const symbolX = look.symbol ? (textWidth > 0 ? x + Math.max(2, (cellW - textWidth - 16) / 2) : x + (cellW - 14) / 2) : 0;
        if (look.symbol) ctx.drawImage(this.sprite(look, ratio), Math.round(symbolX), Math.round((height - 14) / 2), 14, 14);
        if (textWidth > 0) { ctx.fillStyle = look.ink; ctx.fillText(shown, look.symbol ? symbolX + 16 : x + (cellW - textWidth) / 2, height / 2 + 0.5); }
        ctx.fillStyle = this.lineColor; ctx.fillRect(rtl ? x : x + cellW - 1, 0, 1, height);
      }
    },
    /** A state's symbol drawn once, at the screen's pixel ratio, for every cell to copy. */
    sprite(look, ratio) {
      if (look.spriteRatio === ratio) return look.spriteCanvas;
      const canvas = look.spriteCanvas || (look.spriteCanvas = document.createElement("canvas")), size = Math.ceil(14 * ratio);
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(size / 16, 0, 0, size / 16, 0, 0); ctx.clearRect(0, 0, 16, 16);
      ctx.strokeStyle = ctx.fillStyle = look.ink; ctx.lineWidth = 1.8; ctx.lineCap = ctx.lineJoin = "round";
      const path = matrixPath(look.symbol);
      if (path) ctx.stroke(path); else { ctx.beginPath(); ctx.arc(8, 8, 3.6, 0, Math.PI * 2); ctx.fill(); }
      look.spriteRatio = ratio;
      return canvas;
    },
    /** The focusable gridcell over the canvas, placed on a data cell, or taken away when focus is elsewhere. */
    placeFocusCell(r, c) {
      const model = this.model, entry = model.rows[r], column = model.columns[c];
      const row = entry && entry.kind !== "heading" && column && this.rowsMounted.get(entry.key);
      let cell = this.focusCellElement;
      if (!row) { if (cell && cell !== document.activeElement) cell.remove(); return null; }
      if (!cell) { cell = this.focusCellElement = h("div", "cx-mx-cell cx-mx-focus"); cell.setAttribute("role", "gridcell"); cell.tabIndex = -1; }
      const info = model.cell(entry, column), look = this.looks().get(info.state), note = info.note;
      const shown = note && note.text != null ? note.text : note && note.value != null ? this.format.format(note.value) : info.rolled && info.attention ? this.format.format(info.attention) : "";
      cell.setAttribute("aria-label", this.cellName({ row: entry.label, column: column.label, state: look.name }) + (shown ? ", " + shown : ""));
      cell.setAttribute("aria-colindex", String(c + 2));
      cell.style.insetInlineStart = this.rowHeadW + this.columnWindow.offset(c) + "px";
      cell._r = r; cell._c = c;
      if (cell.parentNode !== row) row.appendChild(cell);
      return cell;
    },
    /** The data cell under a pointer event, as { _r, _c }, or null. */
    cellAt(event) {
      const row = event.target.closest && event.target.closest(".cx-mx-row");
      if (!row || !row._entry || row._entry.kind === "heading" || event.target.closest(".cx-mx-rowhead,.cx-mx-total")) return null;
      const box = row.getBoundingClientRect(), from = this.rtl ? box.right - event.clientX : event.clientX - box.left, x = from - this.rowHeadW;
      if (x < 0 || x >= this.columnWindow.total) return null;
      const c = this.columnWindow.at(x);
      return c < 0 || c >= this.model.columns.length ? null : { _r: row._index, _c: c };
    },
    /** The cell's box on screen, for the tooltip. */
    cellRect(r, c) {
      const entry = this.model.rows[r], row = entry && this.rowsMounted.get(entry.key);
      if (!row) return null;
      const box = row.getBoundingClientRect(), offset = this.rowHeadW + this.columnWindow.offset(c);
      const left = this.rtl ? box.right - offset - this.cellW : box.left + offset;
      return { left, top: box.top, right: left + this.cellW, bottom: box.top + this.rowH, width: this.cellW, height: this.rowH };
    },
    /** A quiet outline on the cell under the pointer. */
    hoverCell(target) {
      const hover = this.hoverElement ||= h("div", "cx-mx-hover");
      const entry = target && this.model.rows[target._r], row = entry && this.rowsMounted.get(entry.key);
      if (!row) { hover.remove(); return; }
      hover.style.insetInlineStart = this.rowHeadW + this.columnWindow.offset(target._c) + "px";
      if (hover.parentNode !== row) row.appendChild(hover);
    }
  });
