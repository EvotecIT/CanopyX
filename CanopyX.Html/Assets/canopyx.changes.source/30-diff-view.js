  // ---------- changes: the diff view, its scaffold and its layout ----------
  // A header names the file and counts the lines added and removed; the tools switch inline and side by side, move between
  // changes and copy the unified diff. One scroll container holds a sticky column header (side by side) and a canvas of fixed-height
  // rows, of which only the window in view (plus an overscan) is mounted, so a diff of 200,000 lines scrolls as one of 20.
  const DIFF_ROW = 20, DIFF_OVERSCAN = 30, DIFF_SPLIT_WIDTH = 900;
  // A view built while the page prints (a tab or region the host shows for printing) missed beforeprint, so it draws its print copy at once.
  let changesPrinting = false;
  global.addEventListener("beforeprint", () => { changesPrinting = true; });
  global.addEventListener("afterprint", () => { changesPrinting = false; });
  function changesInPrint() { return changesPrinting || !!(global.matchMedia && global.matchMedia("print").matches); }
  class DiffView {
    constructor(host, options, doc) {
      this.host = host; this.options = options; this.lifetime = new AbortController();
      this.doc = doc || diffDocument(options.view);
      this.labels = changeLabels(this.doc.labels, options.labels);
      this.lang = options.lang || host.closest("[lang]")?.getAttribute("lang") || document.documentElement.lang || "en";
      this.format = numberFormat(this.lang);
      this.mounted = new Map(); this.pool = []; this.current = -1;
      this.chosen = this.doc.layout === "auto" ? null : this.doc.layout;
      this.prepare();
      this.build();
    }
    emit(name, detail, callback) {
      const event = new CustomEvent("canopyx:" + name, { detail, bubbles: true });
      this.host.dispatchEvent(event);
      if (typeof this.options[callback] === "function") { try { this.options[callback](detail, event); } catch (error) { this.host.dispatchEvent(new CustomEvent("canopyx:error", { detail: { error, hook: callback }, bubbles: true })); } }
    }
    /** The hunks: the document's, or the texts compared here when they are short enough; then the rows they show. */
    prepare() {
      const doc = this.doc;
      this.tooLarge = doc.content === "text" && !doc.hunks.length && (doc.left.length > DIFF_CLIENT_LINES || doc.right.length > DIFF_CLIENT_LINES);
      this.hunks = doc.content !== "text" || this.tooLarge ? [] : doc.hunks.length ? doc.hunks : diffHunks(doc.left, doc.right, doc.context);
      const built = diffRows(doc, this.hunks);
      this.rows = built.rows; this.added = built.added; this.removed = built.removed;
    }
    build() {
      const doc = this.doc, labels = this.labels, signal = this.lifetime.signal;
      if (!this.host.closest("[data-cx-theme]")) { this.host.setAttribute("data-cx-theme", "auto"); this.addedTheme = true; }
      const root = this.root = h("div", "cx-diff");
      const head = h("div", "cx-diff-head"), title = this.titleBox = h("div", "cx-diff-title"), tools = this.tools = h("div", "cx-diff-tools");
      head.append(title, tools);
      this.notes = h("div", "cx-diff-notes");
      this.state = h("div", "cx-diff-state"); this.state.hidden = true;
      const scroll = this.scroll = h("div", "cx-diff-scroll");
      scroll.tabIndex = 0; scroll.setAttribute("role", "table");
      this.columns = h("div", "cx-diff-columns"); this.columns.setAttribute("role", "row"); this.columns.setAttribute("aria-rowindex", "1");
      this.canvas = h("div", "cx-diff-canvas"); this.canvas.setAttribute("role", "rowgroup");
      scroll.append(this.columns, this.canvas);
      this.live = h("div", "cx-sr-only"); this.live.setAttribute("aria-live", "polite");
      this.print = h("div", "cx-diff-print");
      root.append(head, this.notes, this.state, scroll, this.live, this.print);
      this.host.appendChild(root);
      this.probe = h("span", "cx-diff-probe"); setText(this.probe, "0000000000"); root.appendChild(this.probe);
      this.buildTools();
      scroll.addEventListener("scroll", () => this.schedule(), { passive: true, signal });
      scroll.addEventListener("keydown", event => this.onKey(event), { signal });
      scroll.addEventListener("click", event => this.onClick(event), { signal });
      global.addEventListener("beforeprint", () => this.renderPrint(), { signal });
      this.resize = new ResizeObserver(() => { if (!this.destroyed) this.layout(); });
      this.resize.observe(root);
      this.refresh();
      if (changesInPrint()) this.renderPrint();
    }
    buildTools() {
      const labels = this.labels, tools = this.tools, signal = this.lifetime.signal;
      const group = this.layoutGroup = h("div", "cx-diff-seg");
      group.setAttribute("role", "radiogroup"); group.setAttribute("aria-label", labels.changeLayout);
      this.layoutButtons = ["inline", "split"].map(mode => {
        const button = h("button", "cx-diff-segbtn"); button.type = "button"; button.setAttribute("role", "radio"); button._mode = mode;
        setText(button, mode === "inline" ? labels.changeInline : labels.changeSplit);
        button.addEventListener("click", () => this.setLayout(mode), { signal });
        button.addEventListener("keydown", event => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault(); const next = mode === "inline" ? "split" : "inline"; this.setLayout(next); this.layoutButtons.find(item => item._mode === next).focus();
        }, { signal });
        group.appendChild(button);
        return button;
      });
      const button = (label, icon, action, text) => {
        const element = h("button", "cx-diff-btn"); element.type = "button"; element.title = label;
        element.appendChild(changeIcon(icon));
        if (text) { const name = h("span"); setText(name, label); element.appendChild(name); } else element.setAttribute("aria-label", label);
        element.addEventListener("click", action, { signal });
        return element;
      };
      this.prevButton = button(labels.changePrevious, "up", () => this.move(-1));
      this.nextButton = button(labels.changeNext, "down", () => this.move(1));
      this.copyButton = button(labels.changeCopyDiff, "copy", () => this.copy(), true);
      tools.append(group, this.prevButton, this.nextButton, this.copyButton);
    }
    /** The texts and states that come from the document: written again when update brings another one. */
    refresh() {
      const doc = this.doc, labels = this.labels, title = this.titleBox;
      title.replaceChildren();
      const name = h("span", "cx-diff-path");
      setText(name, doc.path ? (doc.previousPath && doc.previousPath !== doc.path ? doc.previousPath + " → " + doc.path : doc.path) : doc.label);
      title.appendChild(name);
      if (doc.content === "text" && !this.tooLarge) {
        const stats = h("span", "cx-diff-stats"), plus = h("span", "cx-diff-plus"), minus = h("span", "cx-diff-minus");
        setText(plus, "+" + this.format.format(this.added)); setText(minus, "−" + this.format.format(this.removed));
        const spoken = h("span", "cx-sr-only"); setText(spoken, fill(labels.changeLineCounts, { added: this.format.format(this.added), removed: this.format.format(this.removed) }));
        plus.setAttribute("aria-hidden", "true"); minus.setAttribute("aria-hidden", "true");
        stats.append(plus, minus, spoken); title.appendChild(stats);
      }
      const notes = [];
      for (const note of doc.notes) notes.push([note.text, note.tone || "info"]);
      if (doc.truncated) notes.push([labels.changeTruncated, "warning"]);
      if (doc.message && doc.content === "text") notes.push([doc.message, "info"]);
      this.notes.replaceChildren(...notes.map(([text, tone]) => { const note = h("div", "cx-diff-note"); applyTone(note, "cx-diff-note", toneOf(tone)); setText(note, text); return note; }));
      this.notes.hidden = !notes.length;
      const empty = doc.content !== "text" ? doc.message || (doc.content === "binary" ? labels.changeBinary : doc.content === "identical" ? labels.changeIdentical : labels.changeUnavailable)
        : this.tooLarge ? labels.changeTooLarge : !this.rows.some(row => row.t === "line" && row.kind !== "=") ? labels.changeIdentical : null;
      this.state.hidden = empty === null; setText(this.state, empty || "");
      this.state.className = "cx-diff-state cx-diff-state-" + (this.tooLarge ? "unavailable" : doc.content);
      this.scroll.hidden = !this.rows.some(row => row.t === "line" && row.kind !== "=");
      this.tools.hidden = this.scroll.hidden;
      this.scroll.setAttribute("aria-label", fill(labels.changeDiffOf, { name: doc.label }));
      this.layout(true);
    }
    /** The layout in effect: the reader's or the document's choice, otherwise side by side when there is room. */
    mode() { return this.chosen || (this.root.clientWidth >= DIFF_SPLIT_WIDTH ? "split" : "inline"); }
    setLayout(mode) {
      if (mode !== "inline" && mode !== "split") throw new Error("CanopyX: a diff layout is \"inline\" or \"split\".");
      this.chosen = mode; this.layout(); this.emit("diffLayout", { diff: this.doc.id, layout: mode }, "onLayout");
    }
    layout(force) {
      const mode = this.mode();
      for (const button of this.layoutButtons) { const on = button._mode === mode; button.setAttribute("aria-checked", String(on)); button.tabIndex = on ? 0 : -1; }
      if (!force && mode === this.shown && this.width === this.scroll.clientWidth) return;
      const changed = mode !== this.shown;
      this.shown = mode; this.width = this.scroll.clientWidth;
      if (changed || force) this.display();
      else this.size();
    }
  }
