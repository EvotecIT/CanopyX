  // ---------- changes: windowed painting of the diff rows ----------
  // The rows of the layout in effect are placed with transforms on a canvas as tall as all of them; only those that meet the view
  // (and an overscan) are elements. A line's text is plain text with its changed words in del or ins, never markup from the host.
  Object.assign(DiffView.prototype, {
    /** Builds the display rows of the layout, their change starts and the column header, then sizes and paints them. */
    display() {
      const split = this.shown === "split", labels = this.labels;
      this.view = split ? diffPairs(this.rows) : this.rows;
      this.starts = [];
      this.view.forEach((row, index) => { if (diffChanged(row) && (index === 0 || !diffChanged(this.view[index - 1]))) this.starts.push(index); });
      if (this.current >= this.starts.length) this.current = this.starts.length - 1;
      this.root.classList.toggle("cx-diff-split", split);
      this.columns.hidden = !split;
      if (split) {
        const before = h("span", "cx-diff-colhead"), after = h("span", "cx-diff-colhead");
        before.setAttribute("role", "columnheader"); after.setAttribute("role", "columnheader");
        setText(before, this.doc.beforeTitle || labels.changeBefore); setText(after, this.doc.afterTitle || labels.changeAfter);
        this.columns.replaceChildren(before, after);
      }
      let digits = 1, chars = 1;
      for (const row of this.rows) {
        for (const line of row.t === "gap" ? [] : [row]) {
          digits = Math.max(digits, String(line.b || line.a || 1).length);
          chars = Math.max(chars, line.text.length + (line.text.match(/\t/g)?.length || 0) * 3);
        }
        if (row.t === "gap") digits = Math.max(digits, String(row.b + row.count).length);
      }
      this.digits = digits; this.chars = Math.min(chars, 20000);
      this.scroll.setAttribute("aria-rowcount", String(this.view.length + 1));
      this.root.style.setProperty("--cx-diff-num", (digits + 2) + "ch");
      for (const row of this.mounted.values()) this.release(row);
      this.mounted.clear();
      this.size();
    },
    /** The canvas: as tall as every row, and wide enough for the longest line on each side. */
    size() {
      const cw = this.probe.getBoundingClientRect().width / 10 || 7.5, number = (this.digits + 2) * cw, code = this.chars * cw + 24;
      const needed = this.shown === "split" ? 2 * (number + code) : 2 * number + 2 * cw + code;
      this.canvas.style.height = this.view.length * DIFF_ROW + "px";
      this.canvas.style.width = Math.max(this.scroll.clientWidth, Math.ceil(needed)) + "px";
      this.columns.style.width = this.canvas.style.width;
      this.render();
    },
    schedule() {
      if (this.destroyed || this.frame) return;
      this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
    },
    render() {
      if (this.destroyed || this.scroll.hidden) return;
      const top = this.scroll.scrollTop - this.canvas.offsetTop, height = this.scroll.clientHeight || 600;
      const first = Math.max(0, Math.floor(top / DIFF_ROW) - DIFF_OVERSCAN), last = Math.min(this.view.length - 1, Math.ceil((top + height) / DIFF_ROW) + DIFF_OVERSCAN);
      for (const [index, element] of this.mounted) if (index < first || index > last || element._row !== this.view[index]) { this.release(element); this.mounted.delete(index); }
      const from = this.current >= 0 ? this.starts[this.current] : -1;
      let to = from;
      while (to >= 0 && to < this.view.length && diffChanged(this.view[to])) to++;
      for (let index = first; index <= last; index++) {
        let element = this.mounted.get(index);
        if (!element) { element = this.pool.pop() || h("div"); this.fill(element, this.view[index], index); this.canvas.appendChild(element); this.mounted.set(index, element); }
        element.classList.toggle("cx-diff-current", index >= from && index < to);
      }
    },
    release(element) { element.remove(); element._row = null; if (this.pool.length < 200) this.pool.push(element); },
    fill(element, row, index) {
      element._row = row; element._index = index; element.replaceChildren();
      element.style.transform = "translateY(" + index * DIFF_ROW + "px)";
      element.setAttribute("role", "row"); element.setAttribute("aria-rowindex", String(index + 2));
      if (row.t === "gap") { element.className = "cx-diff-row cx-diff-gaprow"; element.appendChild(this.gapCell(row.gap || row)); return; }
      if (row.t === "line") {
        element.className = "cx-diff-row " + (row.kind === "-" ? "cx-diff-del" : row.kind === "+" ? "cx-diff-add" : "cx-diff-ctx");
        element.append(this.numberCell(row.b), this.numberCell(row.a), this.signCell(row.kind), this.codeCell(row));
        return;
      }
      element.className = "cx-diff-row cx-diff-pairrow";
      for (const [line, side] of [[row.left, "b"], [row.right, "a"]]) {
        const changed = line && line.kind !== "=" ? (line.kind === "-" ? " cx-diff-del" : " cx-diff-add") : "";
        const number = this.numberCell(line ? line[side] : null), code = line ? this.codeCell(line) : h("span", "cx-diff-code cx-diff-blank");
        number.className += changed; code.className += changed;
        if (!line) code.setAttribute("role", "cell");
        element.append(number, code);
      }
    },
    numberCell(value) { const cell = h("span", "cx-diff-num"); cell.setAttribute("role", "cell"); if (value != null) setText(cell, value); return cell; },
    signCell(kind) { const cell = h("span", "cx-diff-sign"); cell.setAttribute("aria-hidden", "true"); setText(cell, kind === "-" ? "−" : kind === "+" ? "+" : ""); return cell; },
    /** A line's text: a screen reader hears what it is first, and its changed words are del or ins. */
    codeCell(line) {
      const cell = h("span", "cx-diff-code"), labels = this.labels, sr = h("span", "cx-sr-only");
      cell.setAttribute("role", "cell");
      setText(sr, fill(line.kind === "-" ? labels.changeLineRemoved : line.kind === "+" ? labels.changeLineAdded : labels.changeLineContext, { line: line.kind === "+" ? line.a : line.b }) + ": ");
      cell.appendChild(sr);
      const marks = line.kind === "=" ? null : diffMarks(line), text = line.text;
      if (!marks || !marks.length) { cell.appendChild(document.createTextNode(text)); return cell; }
      let at = 0;
      for (const [start, end] of marks) {
        if (start > at) cell.appendChild(document.createTextNode(text.slice(at, start)));
        const mark = h(line.kind === "-" ? "del" : "ins", "cx-diff-mark"); setText(mark, text.slice(start, end)); cell.appendChild(mark);
        at = end;
      }
      if (at < text.length) cell.appendChild(document.createTextNode(text.slice(at)));
      return cell;
    },
    gapCell(gap) {
      const cell = h("span", "cx-diff-gap"), labels = this.labels, count = this.format.format(gap.count);
      cell.setAttribute("role", "cell"); cell.setAttribute("aria-colspan", "4");
      if (gap.lines) {
        const button = h("button", "cx-diff-expand"); button.type = "button"; button._gap = gap;
        setText(button, changeCount(labels.changeShowLines, gap.count, this.lang, { count }));
        cell.appendChild(button);
      } else {
        setText(cell, changeCount(labels.changeHiddenLines, gap.count, this.lang, { count }));
      }
      return cell;
    }
  });
