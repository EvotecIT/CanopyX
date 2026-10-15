  // ---------- the rule API, saved views, the legend, the more-menu entry and export records ----------
  // setFormatRules replaces a grid's rules (validated as a whole, so a bad rule set changes nothing) and repaints. Rules that
  // differ from the view's are part of the grid state, so saved views and the remembered state keep them; resetting or
  // applying a view without rules returns to the view's. Export records carry each cell's resolved format for writers that
  // paint (a styled spreadsheet, a print snapshot); CSV and plain text read only values and text, so they are unchanged.
  const FORMAT_EDITOR = definePart(DataGrid, "format-editor", "formatting rule editor", () => ({ DataGrid, h, setText, fill, gridButton, gridOption,
    gridInputLabel, gridIcon, gridDecorateButton, announceMenu, formatCompile, formatToneVar, formatError, FORMAT_ICONS, FORMAT_TONE_ICONS, FORMAT_OPERATORS }));
  function formatPick(labels) {
    const own = {};
    for (const name of Object.keys(FORMAT_LABELS)) own[name] = Object.hasOwn(labels, name) ? labels[name] : FORMAT_LABELS[name];
    return own;
  }
  Object.assign(DataGrid.prototype, {
    startFormatting() {
      if (this.formatStarted || this.destroyed) return;
      this.formatStarted = true; this.formatVersion = 1; this.formatCache = new WeakMap(); this.formatLabels = formatPick(this.labels);
      try { this.formatOptions = formatOptions(this.view.formatting); this.formatCompiled = formatCompile(this.view.formatRules || [], this); }
      catch (error) { this.formatOptions = this.formatOptions || {}; this.formatCompiled = []; this.emit("error", { error }); }
      this.formatRules = gridFreeze(JSON.parse(JSON.stringify(this.formatCompiled.length ? this.view.formatRules : [])));
      this.formatEdited = false; this.formatLegendShown = !!this.formatOptions.legend;
      if (this.formatOptions.editor && this.overflow) {
        const entry = gridButton(this.formatLabels.formatRules, () => this.openFormatRules().catch(error => this.emit("error", { error })));
        entry.classList.add("cx-grid-format-rules"); entry.setAttribute("aria-haspopup", "dialog");
        this.overflow.panel.insertBefore(entry, this.overflow.panel.querySelector(".cx-grid-details, .cx-grid-print"));
      }
      this.syncFormatLegend(); this.syncFormatClock(); this.version++; this.scheduleRender();
    },
    // Relative dates (olderThan, withinLast) move with the clock: rules that use them re-evaluate every minute.
    syncFormatClock() {
      const relative = this.formatCompiled.some(rule => rule.relative);
      if (relative && !this.formatClock) {
        this.formatClock = setInterval(() => { if (this.destroyed) return; this.formatVersion++; this.version++; this.scheduleRender(); }, 60000);
        this.lifetime.signal.addEventListener("abort", () => clearInterval(this.formatClock), { once: true });
      } else if (!relative && this.formatClock) { clearInterval(this.formatClock); this.formatClock = null; }
    },
    setFormatRules(rules) {
      try {
        if (this.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
        this.startFormatting();
        const json = JSON.stringify(rules), compiled = formatCompile(JSON.parse(json ?? "null"), this);
        if (json !== JSON.stringify(this.formatRules)) {
          this.formatRules = gridFreeze(JSON.parse(json)); this.formatCompiled = compiled; this.formatEdited = json !== JSON.stringify(this.view.formatRules || []);
          this.formatVersion++; this.formatStatsKey = undefined; this.version++; this.scheduleRender(); this.syncFormatLegend(); this.syncFormatClock();
          this.stateChanged(); this.emit("format", { rules: this.getFormatRules() });
        }
        return Promise.resolve(this.getFormatRules());
      } catch (error) { return Promise.reject(error); }
    },
    openFormatRules() {
      this.startFormatting();
      return loadPart(FORMAT_EDITOR).then(() => { if (!this.destroyed) this.showFormatEditor(); });
    },
    setFormatLegend(shown) { this.formatLegendShown = !!shown; this.syncFormatLegend(); },
    // The legend lists the enabled rules with a label: a swatch in the rule's style, its icon, and its label; bands list each band.
    syncFormatLegend() {
      const rules = this.formatLegendShown ? this.formatCompiled.filter(rule => rule.enabled && rule.label) : [];
      if (!rules.length) { this.formatLegend?.remove(); this.formatLegend = null; return; }
      const legend = this.formatLegend ||= h("ul", "cx-format-legend");
      legend.setAttribute("aria-label", this.formatLabels.formatLegend); legend.replaceChildren();
      const key = (text, style, description) => {
        const item = h("li", "cx-format-key"), swatch = h("span", "cx-format-swatch"), label = h("span");
        swatch.setAttribute("aria-hidden", "true"); setText(label, text);
        const target = formatFinish({ tone: style.tone, icon: style.icon, badge: style.badge, cue: style.cue, emphasis: style.emphasis }), fx = formatEffects(swatch);
        if (style.scale) { swatch.classList.add("cx-fmt-gradient"); swatch.style.setProperty("--cx-fmt-scale", "linear-gradient(90deg," + style.scale.stops.map(stop => formatToneVar(stop.tone)).join(",") + ")"); }
        else if (style.bar) formatDecorate(swatch, { bar: { width: .7, tone: style.bar.tone || style.tone || "info" } }, fx, null);
        else if (target.badge && !target.glyph) { swatch.classList.add("cx-format-badge"); formatDecorate(swatch, { badge: target.badge, tone: target.tone }, fx, null); }
        else formatDecorate(swatch, { tone: target.tone, glyph: target.glyph, emphasis: target.emphasis }, fx, null, "fill");
        if (description && description !== text) item.title = description;
        item.append(swatch, label); legend.appendChild(item);
      };
      for (const rule of rules) {
        if (rule.style.bands) rule.style.bands.forEach((band, index) => key(rule.label + ": " + (band.label || (band.upperBound === undefined ?
          this.formatLabels.formatAbove + " " + numberFormat(this.lang).format(rule.style.bands[index - 1]?.upperBound ?? 0) :
          this.formatLabels.formatUpTo + " " + numberFormat(this.lang).format(band.upperBound))), { tone: band.tone, icon: band.icon ?? rule.style.icon }));
        else key(rule.label, rule.style, rule.description);
      }
      if (!legend.isConnected) this.host.insertBefore(legend, this.notice);
    }
  });
  // Export records: the format of each cell (and of the record, for row targets) beside its value and text.
  function formatExported(target) {
    if (!target) return undefined;
    const out = { rules: target.rules.slice() };
    for (const name of ["tone", "badge", "cue", "band"]) if (target[name] !== undefined) out[name] = target[name];
    if (target.glyph) out.icon = target.glyph;
    if (target.bar) out.bar = { fraction: Math.round(target.bar.width * 1000) / 1000, tone: target.bar.tone };
    if (target.scale) out.color = target.scale;
    if (target.descriptions.length) out.description = target.descriptions.join(", ");
    return out;
  }
  // The export part hands each record here after building it (78-grid-export-text.js); grids without rules keep theirs.
  GRID_REPORTING.formatRecord = (grid, row, record) => {
    const result = grid.formatResult && grid.formatResult(row);
    if (!result) return record;
    const cells = {};
    for (const [id, cell] of Object.entries(record.cells)) { const format = formatExported(result.cells.get(id)); cells[id] = format ? { ...cell, format } : cell; }
    return gridFreeze({ ...record, cells, ...(result.row ? { format: formatExported(result.row) } : {}) });
  };
