  // ---------- evaluation: once per row and rule set, cached by the row's data ----------
  // Rows evaluate when they paint, so a grid of 100,000 rows evaluates the few dozen it shows. A row's result is kept in a
  // WeakMap by its data object for the current rule version; scrolling back repaints from the cache. Automatic bounds of
  // bars and scales (min, max, percent) come from every inline row, or from the rows a host grid has received, and are
  // recomputed when that set changes. Rules apply in order: for each target the first rule that sets an aspect (tone, icon,
  // badge, cue, bar, scale, css) wins it, every matched rule adds its description, and stopIfTrue ends the row's rules.
  function formatStats(grid) {
    // An enhanced table's store counts its changes; compact row data arrives chunk by chunk into the same array and new rows
    // (insertRow) are pushed onto it, so the inline key follows the store's version and the rows' length together.
    const inline = grid.view.source.kind === "inline" && (!grid.opts.source || grid.enhanceStore),
      key = inline ? "inline:" + (grid.enhanceStore?.version ?? 0) + ":" + grid.view.rows.length : grid.queryEpoch + ":" + (grid.snapshot?.revision || "") + ":" + [...grid.pages.keys()].join(",");
    if (grid.formatStatsKey === key) return grid.formatStatsCache;
    const wanted = new Set(grid.formatCompiled.filter(rule => rule.style.bar || rule.style.scale).map(rule => rule.column)), stats = new Map();
    if (wanted.size) {
      const rows = inline ? grid.view.rows : [...grid.rowCache.values()].map(row => row.h);
      for (const id of wanted) {
        let min = Infinity, max = -Infinity;
        for (const row of rows) { const value = formatCoerce(cellValue(row.cells[id]), "number"); if (value !== null) { if (value < min) min = value; if (value > max) max = value; } }
        stats.set(id, min <= max ? { min, max } : null);
      }
    }
    if (grid.formatStatsKey !== undefined && wanted.size) {
      grid.formatVersion++;
      if (grid.recordDrawer) DataGrid.refreshDrawerHooks(grid, grid.recordDrawer);
    }
    grid.formatStatsKey = key; grid.formatStatsCache = stats;
    return stats;
  }
  function formatBound(stop, stats) {
    return stop.type === "number" ? stop.value : !stats ? null : stop.type === "min" ? stats.min : stop.type === "max" ? stats.max : stats.min + (stats.max - stats.min) * stop.value / 100;
  }
  const formatMix = (a, b, t) => t <= 0 ? formatToneVar(a) : t >= 1 ? formatToneVar(b) : "color-mix(in oklab," + formatToneVar(b) + " " + Math.round(t * 100) + "%," + formatToneVar(a) + ")";
  // The resolved style of a matched rule for one row: its tone, icon and text cues, and the bar, scale colour or band it draws.
  function formatResolve(rule, data, stats) {
    const style = rule.style, out = { tone: style.tone, emphasis: style.emphasis, icon: style.icon, badge: style.badge, cue: style.cue, className: style.className, css: style.css };
    if (style.bar || style.scale || style.bands) {
      const value = formatCoerce(cellValue(data.cells[rule.column]), "number");
      if (value === null) return null;
      const range = stats.get(rule.column);
      if (style.bar) {
        const low = style.bar.minimum ?? Math.min(0, range ? range.min : 0), high = style.bar.maximum ?? (range ? range.max : low + 1);
        out.bar = { width: high > low ? Math.max(0, Math.min(1, (value - low) / (high - low))) : 0, tone: style.bar.tone || style.tone || "info", show: style.bar.showValue !== false };
        out.tone = undefined;
      } else if (style.scale) {
        const stops = style.scale.stops.map(stop => ({ at: formatBound(stop, range), tone: stop.tone })).filter(stop => stop.at !== null).sort((a, b) => a.at - b.at);
        if (stops.length < 2) return null;
        const last = stops.length - 1, upper = stops.findIndex(stop => value <= stop.at), to = upper < 0 ? last : Math.max(1, upper), from = stops[to - 1], next = stops[to];
        out.scale = formatMix(from.tone, next.tone, next.at > from.at ? (value - from.at) / (next.at - from.at) : 1);
        out.tone = undefined;
      } else {
        const band = style.bands.find(item => item.upperBound === undefined || value <= item.upperBound);
        if (!band) return null;
        out.tone = band.tone; out.icon = band.icon ?? style.icon; out.band = band.label;
      }
    }
    return out;
  }
  function formatMerge(into, rule, style) {
    const target = into || { rules: [], descriptions: [] };
    for (const name of ["tone", "emphasis", "icon", "badge", "cue", "className", "css", "bar", "scale", "band"])
      if (target[name] === undefined && style[name] !== undefined) target[name] = style[name];
    target.rules.push(rule.id);
    if (rule.description && !target.descriptions.includes(rule.description)) target.descriptions.push(rule.description);
    if (style.band && !target.descriptions.includes(style.band)) target.descriptions.push(style.band);
    target.details = target.details || rule.details;
    return target;
  }
  // A final target: a rule that only colours gets its tone's shape, unless it asked for no icon.
  function formatFinish(target) {
    if (!target) return target;
    if (target.icon === undefined && target.tone && !target.badge && !target.cue && !target.bar && !target.scale) target.icon = "auto";
    const name = target.icon === "auto" ? FORMAT_TONE_ICONS[target.tone] || "dot" : target.icon;
    target.glyph = name && name !== "none" ? FORMAT_ICONS[name] || name : null;
    return target;
  }
  Object.assign(DataGrid.prototype, {
    // { row, cells: Map of column id -> target } for a row's data, or null when no rule applies.
    formatResult(data, details = false) {
      const rules = this.formatCompiled;
      if (!rules || !rules.length) return null;
      const cache = details ? this.formatDetailCache ||= new WeakMap() : this.formatCache;
      const stats = formatStats(this), cached = cache.get(data);
      if (cached && cached.version === this.formatVersion) return cached.result;
      let row = null, cells = null;
      for (const rule of rules) {
        if (!rule.enabled || rule.test && !rule.test(data)) continue;
        const style = formatResolve(rule, data, stats);
        if (style && (!details || rule.details)) {
          if (rule.target === "row") row = formatMerge(row, rule, style);
          else for (const id of rule.columns) (cells ||= new Map()).set(id, formatMerge(cells.get(id), rule, style));
        }
        if (rule.stop) break;
      }
      if (cells) for (const target of cells.values()) formatFinish(target);
      const result = row || cells ? { row: formatFinish(row), cells: cells || new Map() } : null;
      cache.set(data, { version: this.formatVersion, result });
      return result;
    }
  });
