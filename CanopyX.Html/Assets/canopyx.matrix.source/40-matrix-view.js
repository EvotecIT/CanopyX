  // ---------- matrix: the view, its scaffold and its sizes ----------
  // One scroll container holds a sticky header (column groups, column labels written upwards, the corner), the windowed body
  // and a sticky totals row. Row headers stick to the inline start and row totals to the inline end, so right-to-left pages
  // mirror without extra code. Rows and columns are both windowed with AxisWindow (31-axis-window.js in the grid runtimes).
  const MATRIX_ROW_HEIGHTS = { compact: 26, normal: 30, comfortable: 36 }, MATRIX_TOTAL_WIDTH = 64, MATRIX_OVERSCAN = 96;
  class MatrixView {
    constructor(host, options) {
      this.host = host; this.options = options; this.lifetime = new AbortController();
      this.doc = matrixDocument(options.view);
      this.labels = matrixLabels(this.doc.labels, options.labels);
      this.lang = host.closest("[lang]")?.getAttribute("lang") || document.documentElement.lang || "en";
      this.format = numberFormat(this.lang);
      this.model = new MatrixModel(this.doc, this.format);
      this.query = this.model.initialQuery();
      if (options.state) this.applyState(options.state, false);
      this.rowWindow = new AxisWindow(); this.columnWindow = new AxisWindow();
      this.rowsMounted = new Map(); this.rowPool = []; this.tilePool = []; this.headMounted = new Map(); this.footMounted = new Map(); this.bandMounted = new Map();
      this.focus = { row: 0, column: 0 };
      this.build();
      this.derive();
    }
    emit(name, detail, callback, cancelable) {
      const event = new CustomEvent("canopyx:" + name, { detail, bubbles: true, cancelable: !!cancelable });
      const proceed = this.host.dispatchEvent(event);
      if (typeof this.options[callback] === "function") { try { this.options[callback](detail, event); } catch (error) { this.reportError(error, callback); } }
      return proceed && !event.defaultPrevented;
    }
    reportError(error, hook) { this.host.dispatchEvent(new CustomEvent("canopyx:error", { detail: { error, hook }, bubbles: true })); }
    build() {
      const host = this.host, doc = this.doc, signal = this.lifetime.signal;
      const root = this.root = h("div", "cx-matrix cx-mx-" + doc.density);
      this.bar = h("div", "cx-mx-bar"); this.legend = h("div", "cx-mx-legend");
      this.legend.setAttribute("role", "list"); this.legend.setAttribute("aria-label", this.labels.matrixLegend); this.legend.hidden = !doc.legend;
      const scroll = this.scroll = h("div", "cx-mx-scroll");
      scroll.setAttribute("role", "grid"); scroll.setAttribute("aria-label", doc.label);
      this.head = h("div", "cx-mx-head"); this.head.setAttribute("role", "rowgroup");
      this.band = h("div", "cx-mx-band"); this.band.setAttribute("role", "row");
      this.headRow = h("div", "cx-mx-hrow"); this.headRow.setAttribute("role", "row");
      this.corner = h("div", "cx-mx-corner"); this.corner.setAttribute("role", "columnheader"); this.corner.setAttribute("aria-colindex", "1");
      this.headSpacer = h("div", "cx-mx-spacer"); this.headTotal = h("div", "cx-mx-total cx-mx-htotal"); this.headTotal.setAttribute("role", "columnheader");
      this.band.setAttribute("aria-rowindex", "1");
      this.headRow.append(this.corner, this.headSpacer, this.headTotal);
      this.bandCorner = h("div", "cx-mx-corner cx-mx-bandcorner"); this.bandSpacer = h("div", "cx-mx-spacer"); this.bandEnd = h("div", "cx-mx-total cx-mx-bandend");
      this.band.append(this.bandCorner, this.bandSpacer, this.bandEnd);
      this.head.append(this.band, this.headRow);
      this.body = h("div", "cx-mx-body"); this.body.setAttribute("role", "rowgroup");
      this.foot = h("div", "cx-mx-foot"); this.foot.setAttribute("role", "rowgroup");
      this.footRow = h("div", "cx-mx-frow"); this.footRow.setAttribute("role", "row");
      this.footHeader = h("div", "cx-mx-rowhead cx-mx-foothead"); this.footHeader.setAttribute("role", "rowheader"); this.footHeader.setAttribute("aria-colindex", "1");
      this.footSpacer = h("div", "cx-mx-spacer"); this.footGrand = h("div", "cx-mx-total cx-mx-grand"); this.footGrand.setAttribute("role", "gridcell");
      this.footRow.append(this.footHeader, this.footSpacer, this.footGrand); this.foot.appendChild(this.footRow);
      this.empty = h("div", "cx-mx-empty"); this.empty.hidden = true;
      scroll.append(this.head, this.body, this.foot);
      this.live = h("div", "cx-sr-only"); this.live.setAttribute("aria-live", "polite");
      this.tip = h("div", "cx-mx-tip"); this.tip.setAttribute("aria-hidden", "true"); this.tip.hidden = true;
      // The phone cards scroll inside the host: a focusable region, so the keyboard reaches all of them.
      this.cards = h("div", "cx-mx-cards"); this.cards.hidden = true; this.cards.tabIndex = 0; this.cards.setAttribute("role", "region"); this.cards.setAttribute("aria-label", doc.label);
      this.print = h("div", "cx-mx-print");
      root.append(this.bar, this.legend, scroll, this.empty, this.cards, this.live, this.tip, this.print);
      host.appendChild(root);
      this.buildBar();
      scroll.addEventListener("scroll", () => { this.hideTip(); this.scheduleRender(); }, { passive: true, signal });
      scroll.addEventListener("keydown", event => this.onKey(event), { signal });
      scroll.addEventListener("click", event => this.onClick(event), { signal });
      scroll.addEventListener("focusin", event => this.onFocus(event), { signal });
      scroll.addEventListener("pointermove", event => this.onPointer(event), { signal });
      scroll.addEventListener("pointerleave", () => this.hideTip(), { signal });
      global.addEventListener("beforeprint", () => this.renderPrint(), { signal });
      this.resize = new ResizeObserver(() => {
        if (this.destroyed) return;
        // A new size can drop the mounted cells; keyboard focus goes back to its cell.
        const focused = this.scroll.contains(document.activeElement);
        this.layout(); this.render();
        if (focused && !this.scroll.contains(document.activeElement)) {
          if (!this.scroll.hidden) this.moveTo(this.focus.row, this.focus.column, true, false);
          else if (!this.cards.hidden) this.cards.focus({ preventScroll: true });
        }
      });
      this.refreshChrome();
      this.resize.observe(host);
      // The canvas reads its colours from the stylesheet: a theme switch, a colour scheme or forced colours draw the cells again.
      const restyle = () => { if (!this.destroyed) { this.lookCache = null; this.scheduleRender(); } };
      this.themeWatch = new MutationObserver(restyle);
      const themeAttributes = ["data-theme", "data-cx-theme", "data-cx-fallback-mode", "data-hfx-style", "data-hfx-mode", "data-hfx-density", "data-bs-theme", "data-hfx-theme", "data-hfx-tokens", "class", "style"];
      for (let owner = host; owner; owner = owner.parentElement) this.themeWatch.observe(owner, { attributes: true, attributeFilter: themeAttributes });
      for (const query of ["(prefers-color-scheme: dark)", "(forced-colors: active)"]) global.matchMedia?.(query).addEventListener?.("change", restyle, { signal });
    }
    /** The texts that come from the document and the labels: written again when update brings another document. */
    refreshChrome() {
      const doc = this.doc, labels = this.labels;
      this.scroll.setAttribute("aria-label", doc.label); this.cards.setAttribute("aria-label", doc.label);
      this.legend.setAttribute("aria-label", labels.matrixLegend); this.legend.hidden = !doc.legend;
      setText(this.headTotal, labels.matrixTotal); setText(this.footHeader, labels.matrixTotal); setText(this.empty, labels.matrixNoMatches);
      // The corner names both axes: the column axis reads along the header, the row axis down the row headers.
      const columnsTitle = h("span", "cx-mx-corner-columns"), rowsTitle = h("span", "cx-mx-corner-rows");
      setText(columnsTitle, doc.columnTitle || labels.matrixColumns); setText(rowsTitle, doc.rows.title || labels.matrixRows);
      this.corner.replaceChildren(columnsTitle, rowsTitle);
      this.refreshBar?.();
    }
    /** Re-derives what the reader sees from the query, then lays it out and paints it; keyboard focus stays on its cell. */
    derive(announce, anchor = this.captureFocus()) {
      const focused = this.scroll.contains(document.activeElement);
      this.model.derive(this.query);
      this.restoreFocus(anchor);
      this.syncBar(); this.paintLegend();
      this.layout(); this.recycleAll(); this.render();
      // Retain the same entities after sorting or refresh. Reveal them only when the matrix already owns focus.
      if (focused && !this.scroll.hidden) this.moveTo(this.focus.row, this.focus.column, true, false);
      if (announce) setText(this.live, this.summaryText());
    }
    layout() {
      const doc = this.doc, width = this.host.clientWidth || 800, phone = width <= 640;
      this.phone = phone; this.root.classList.toggle("cx-mx-phone", phone);
      this.rtl = getComputedStyle(this.root).direction === "rtl";
      this.rowH = MATRIX_ROW_HEIGHTS[doc.density] + (phone ? 4 : 0);
      this.cellW = doc.cellWidth;
      const measure = this.measurer ||= document.createElement("canvas").getContext("2d");
      const style = getComputedStyle(this.root), font = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
      const widest = (items, extra = 0) => { let max = 0; if (measure) { measure.font = font; for (const item of items) max = Math.max(max, measure.measureText(item.label).width + extra); } return max; };
      const grouped = !!this.query.group.rows;
      // The label shows whole; secondary text takes what is left, up to 140 pixels, and gives way first.
      // On phones the row headers show labels only, so more columns fit beside them.
      const secondary = !phone && this.model.rows.some(entry => entry.kind === "item" && entry.item.secondary) ? Math.min(140, widest(this.model.rows.filter(entry => entry.kind === "item" && entry.item.secondary).map(entry => ({ label: entry.item.secondary }))) * 0.88 + 6) : 0;
      const rowNeed = Math.ceil(widest(this.model.rows) + secondary + 28 + (grouped ? 14 : 0));
      this.rowHeadW = Math.min(phone ? Math.max(96, Math.floor(width * 0.42)) : 280, Math.max(phone ? 96 : 120, rowNeed));
      this.headH = Math.min(160, Math.max(56, Math.ceil(widest(this.model.columns) + 20)));
      this.bandH = this.query.group.columns ? 28 : 0;
      this.totalW = doc.rowTotals ? phone ? 48 : MATRIX_TOTAL_WIDTH : 0;
      this.footH = doc.columnTotals ? this.rowH : 0;
      // A size or direction change moves every mounted row, header cell and canvas tile: they are dropped and painted anew.
      const geometry = [this.rowH, this.rowHeadW, this.cellW, this.headH, this.bandH, this.totalW, this.rtl, phone].join(":");
      if (this.geometry !== undefined && this.geometry !== geometry) this.recycleAll();
      this.geometry = geometry;
      this.rowWindow.reset(this.rowH, this.model.rows.length);
      this.columnWindow.reset(this.cellW, this.model.columns.length);
      const contentW = this.rowHeadW + this.columnWindow.total + this.totalW;
      const root = this.root.style;
      root.setProperty("--mx-row-h", this.rowH + "px"); root.setProperty("--mx-cell-w", this.cellW + "px"); root.setProperty("--mx-head-w", this.rowHeadW + "px");
      root.setProperty("--mx-head-h", this.headH + "px"); root.setProperty("--mx-band-h", this.bandH + "px"); root.setProperty("--mx-total-w", this.totalW + "px");
      root.setProperty("--mx-content-w", contentW + "px"); root.setProperty("--mx-cols-w", this.columnWindow.total + "px");
      this.body.style.height = this.rowWindow.total + "px";
      this.band.hidden = !this.bandH; this.foot.hidden = !this.footH; this.headTotal.hidden = this.bandEnd.hidden = !this.totalW; this.footGrand.hidden = !this.totalW;
      const nothing = !this.model.rows.length || !this.model.columns.length;
      this.empty.hidden = !nothing; this.scroll.hidden = nothing;
      const cards = phone && doc.phone === "cards";
      this.cards.hidden = !cards || nothing; if (cards) this.scroll.hidden = true;
      this.scroll.setAttribute("aria-rowcount", String(this.model.rows.length + (this.bandH ? 2 : 1) + (this.footH ? 1 : 0)));
      this.headRow.setAttribute("aria-rowindex", this.bandH ? "2" : "1");
      this.headTotal.setAttribute("aria-colindex", String(this.model.columns.length + 2));
      this.scroll.setAttribute("aria-colcount", String(this.model.columns.length + 1 + (this.totalW ? 1 : 0)));
      if (cards) this.renderCards();
      this.fitHeight();
    }
    /** Auto height: a matrix whose content fits is as tall as its toolbar, legend and cells, and the host's height stays the
     *  bound, as on trees and flat grids (32-grid-auto-height.js). The content height never depends on the host's, so the
     *  resize observer settles after one pass; the host is resized in the next frame, never while the observer delivers. */
    fitHeight() {
      if (this.fitFrame) return;
      this.fitFrame = requestAnimationFrame(() => { this.fitFrame = 0; if (!this.destroyed) this.fitNow(); });
    }
    fitNow() {
      const host = this.host, style = host.style;
      if (this.fitInline === undefined) {
        // The host's own max-height stays a bound; one that is not in pixels (a percentage, a calc) is left to the host alone.
        const own = getComputedStyle(host).maxHeight;
        this.fitInline = style.maxHeight; this.fitMax = own === "none" ? Infinity : /px$/.test(own) ? parseFloat(own) : NaN;
      }
      if (this.doc.autoHeight === false || Number.isNaN(this.fitMax)) { if (style.maxHeight !== this.fitInline) style.maxHeight = this.fitInline; return; }
      // A hidden host has no sizes to read; the observer calls again when it shows.
      if (!host.offsetHeight) return;
      const parts = [this.bar, this.legend, this.scroll, this.empty, this.cards].filter(part => !part.hidden), hostStyle = getComputedStyle(host);
      let content = (parts.length - 1) * (parseFloat(getComputedStyle(this.root).rowGap) || 0);
      for (const part of parts) {
        let height = part.getBoundingClientRect().height;
        // The scrolling parts count their whole content, up to their own bound (the window's height).
        if (part === this.scroll || part === this.cards) height = Math.min(height + part.scrollHeight - part.clientHeight, parseFloat(getComputedStyle(part).maxHeight) || Infinity);
        content += height;
      }
      const chrome = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce((sum, name) => sum + (parseFloat(hostStyle[name]) || 0), 0);
      const value = Math.min(this.fitMax, Math.ceil(chrome + content)) + "px";
      if (style.maxHeight !== value) style.maxHeight = value;
    }
  }
