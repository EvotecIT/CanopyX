  // ---------- changes: moving between changes, opening folded lines, copying and printing a diff ----------
  // The rows are one tab stop: arrows, Page Up and Down, Home and End scroll them; n and p (or Alt with Down and Up) move to the next
  // and previous change, as the toolbar's buttons do, and say where the reader is. Copy writes the unified diff to the clipboard.
  /** Copies text: the Clipboard API, or a selected text area where it is unavailable (pages opened from disk in some browsers). */
  async function changeCopy(text) {
    try { if (global.navigator?.clipboard?.writeText) { await global.navigator.clipboard.writeText(text); return true; } } catch (error) { }
    const area = h("textarea", "cx-sr-only"); area.value = text; area.setAttribute("readonly", ""); document.body.appendChild(area); area.select();
    let done = false;
    try { done = document.execCommand("copy"); } catch (error) { done = false; }
    area.remove();
    return done;
  }
  Object.assign(DiffView.prototype, {
    onKey(event) {
      if (event.target !== this.scroll) return;
      const scroll = this.scroll, page = Math.max(DIFF_ROW, scroll.clientHeight - 2 * DIFF_ROW), key = event.key;
      const moves = { ArrowDown: DIFF_ROW, ArrowUp: -DIFF_ROW, PageDown: page, PageUp: -page };
      if (event.altKey && (key === "ArrowDown" || key === "ArrowUp")) { event.preventDefault(); this.move(key === "ArrowDown" ? 1 : -1); return; }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && (key === "n" || key === "p")) { event.preventDefault(); this.move(key === "n" ? 1 : -1); return; }
      if (Object.hasOwn(moves, key)) { event.preventDefault(); scroll.scrollTop += moves[key]; }
      else if (key === "Home" || key === "End") { event.preventDefault(); scroll.scrollTop = key === "Home" ? 0 : scroll.scrollHeight; }
    },
    onClick(event) {
      const button = event.target.closest?.(".cx-diff-expand");
      if (!button || !this.scroll.contains(button)) return;
      this.expand(button._gap);
    },
    /** Opens a folded region in place and keeps the rows above it where they were. */
    expand(gap) {
      const at = this.rows.indexOf(gap);
      if (at < 0 || !gap.lines) return;
      this.rows.splice(at, 1, ...gap.lines);
      const current = this.current >= 0 ? this.view[this.starts[this.current]] : null;
      this.display();
      if (current) this.current = this.starts.indexOf(this.view.indexOf(current));
      this.render();
      this.scroll.focus({ preventScroll: true });
      setText(this.live, changeCount(this.labels.changeShowLines, gap.count, this.lang, { count: this.format.format(gap.count) }));
    },
    expandAll() { for (const gap of this.rows.filter(row => row.t === "gap" && row.lines)) this.expand(gap); },
    /** Moves to the next (1) or previous (-1) change, scrolls it into view with two lines above it and says which it is. */
    move(step) {
      if (!this.starts.length) return false;
      this.current = this.current < 0 ? (step > 0 ? 0 : this.starts.length - 1) : (this.current + step + this.starts.length) % this.starts.length;
      const top = this.canvas.offsetTop + Math.max(0, this.starts[this.current] - 2) * DIFF_ROW - this.columns.offsetHeight;
      this.scroll.scrollTop = Math.max(0, top);
      this.render();
      setText(this.live, fill(this.labels.changePosition, { index: this.format.format(this.current + 1), count: this.format.format(this.starts.length) }));
      return true;
    },
    async copy() {
      const ok = await changeCopy(diffUnified(this.doc, this.hunks));
      if (this.destroyed) return ok;
      const text = ok ? this.labels.changeCopied : this.labels.changeCopyFailed;
      setText(this.live, text); this.copyButton.classList.toggle("cx-diff-done", ok);
      clearTimeout(this.copyTimer); this.copyTimer = setTimeout(() => this.copyButton.classList.remove("cx-diff-done"), 1600);
      this.emit("diffCopy", { diff: this.doc.id, copied: ok }, "onCopy");
      return ok;
    },
    /** Printing draws every row as one inline table (the first 5,000 lines), since the window holds only what is in view. */
    renderPrint() {
      if (this.destroyed || this.scroll.hidden) { this.print.replaceChildren(); return; }
      const table = h("table", "cx-diff-printtable"), body = h("tbody");
      let written = 0;
      for (const row of this.rows) {
        if (written++ >= 5000) break;
        const tr = h("tr");
        if (row.t === "gap") { const td = h("td", "cx-diff-gap"); td.colSpan = 4; setText(td, "⋯ " + changeCount(this.labels.changeHiddenLines, row.count, this.lang, { count: this.format.format(row.count) })); tr.appendChild(td); }
        else {
          tr.className = row.kind === "-" ? "cx-diff-del" : row.kind === "+" ? "cx-diff-add" : "";
          for (const [text, name] of [[row.b, "cx-diff-num"], [row.a, "cx-diff-num"], [row.kind === "-" ? "−" : row.kind === "+" ? "+" : "", "cx-diff-sign"]]) { const td = h("td", name); setText(td, text ?? ""); tr.appendChild(td); }
          const code = this.codeCell(row), td = h("td", "cx-diff-code"); td.append(...code.childNodes); tr.appendChild(td);
        }
        body.appendChild(tr);
      }
      // Paper says how many lines the printed copy leaves out, so a long diff is never cut silently.
      if (written > 5000) {
        const rest = this.rows.slice(5000).reduce((sum, row) => sum + (row.t === "gap" ? 0 : 1), 0), tr = h("tr"), td = h("td", "cx-diff-gap");
        td.colSpan = 4; setText(td, "⋯ " + fill(this.labels.changePrintLimit, { count: this.format.format(rest) })); tr.appendChild(td); body.appendChild(tr);
      }
      table.appendChild(body); this.print.replaceChildren(table);
    },
    /** The hunks in effect, as plain data: the document's or those compared here. */
    getHunks() { return this.hunks.map(hunk => ({ before: hunk.before, after: hunk.after, lines: hunk.lines.map(line => (line.kind === "=" ? " " : line.kind) + line.text) })); },
    update(view) {
      this.doc = diffDocument(view); this.labels = changeLabels(this.options.baseLabels, this.doc.labels, this.options.labels); this.source = view;
      this.current = -1; this.prepare(); this.refresh();
    }
  });

  function diffCreate(host, options, doc) {
    const view = new DiffView(host, options, doc);
    const impl = {
      ready: Promise.resolve().then(() => { if (view.destroyed) return impl; host.setAttribute("data-cx-ready", ""); view.emit("diffReady", { diff: view.doc.id }, "onReady"); return impl; }),
      document: () => view.source || options.view,
      getLayout: () => view.shown, setLayout: mode => view.setLayout(mode), next: () => view.move(1), previous: () => view.move(-1), expandAll: () => view.expandAll(),
      copy: () => view.copy(), getHunks: () => view.getHunks(), update: next => view.update(next),
      destroy: () => {
        if (view.destroyed) return;
        view.destroyed = true; view.lifetime.abort(); view.resize.disconnect(); cancelAnimationFrame(view.frame); clearTimeout(view.copyTimer);
        view.root.remove(); host.removeAttribute("data-cx-ready");
        if (view.addedTheme) host.removeAttribute("data-cx-theme");
      }
    };
    return impl;
  }
