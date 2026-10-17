  // ---------- rules: identity, target, condition and style, validated once into compiled rules ----------
  // Styles come from theme tones (--cx-tone-<name>), so they follow the light, dark and print palettes. className and css
  // are the escape hatch. A rule that only colours gets a shape icon per tone unless it sets icon "none", and every
  // matched cell carries the rule's description for screen readers: formatting is never colour alone.
  const FORMAT_ICONS = { up: "↑", down: "↓", check: "✓", cross: "✕", warning: "⚠︎", info: "ⓘ", dot: "●", circle: "○", triangle: "▲",
    square: "■", diamond: "◆", flag: "⚑", star: "★", minus: "−", plus: "+", clock: "◷" };
  const FORMAT_TONE_ICONS = { danger: "cross", warning: "warning", success: "check", info: "info" };
  // The format* labels the formatting part writes itself; the editor part carries the rest. Hosts and packs translate them.
  const FORMAT_LABELS = { formatRules: "Conditional formatting", formatLegend: "Formatting legend", formatUpTo: "Up to", formatAbove: "Above",
    formatHiddenFlagged: "{count} hidden fields formatted: {rules}" };
  function formatToneVar(tone) {
    return tone === "neutral" ? "var(--cx-text-2)" : tone === "muted" ? "var(--cx-muted)" : "var(--cx-tone-" + tone + ",var(--cx-text-2))";
  }
  function formatTone(value) {
    if (typeof value !== "string" || !toneOf(value).cls) formatError("'" + value + "' is not a tone name.");
    return value;
  }
  const formatText = (value, limit) => value === undefined || typeof value === "string" && value.trim() && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value) ? value : formatError("formatting text must have 1 to " + limit + " visible characters.");
  const formatFinite = value => value === undefined || Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : formatError("formatting bounds are finite numbers.");
  function formatIcon(value) {
    if (value === undefined || value === "auto" || value === "none" || Object.hasOwn(FORMAT_ICONS, value)) return value;
    if (typeof value !== "string" || !value.trim() || [...value].length > 4 || /[\u0000-\u001f\u007f<>]/.test(value)) formatError("an icon is a known name or up to four characters.");
    return value;
  }
  function formatStyle(style, rule) {
    formatKeys(style, ["tone", "emphasis", "icon", "badge", "cue", "bar", "scale", "bands", "className", "css"], "formatting style");
    if (style.tone !== undefined) formatTone(style.tone);
    if (style.emphasis !== undefined && !["fill", "text", "strong"].includes(style.emphasis)) formatError("emphasis is fill, text or strong.");
    formatIcon(style.icon); formatText(style.badge, 64); formatText(style.cue, 64);
    if (style.className !== undefined && (typeof style.className !== "string" || !style.className.trim() || style.className.length > 1024 || /[\u0000-\u001f\u007f-\u009f]/.test(style.className)))
      formatError("invalid formatting className.");
    if (style.css !== undefined) {
      formatKeys(style.css, Object.keys(style.css), "formatting css");
      const entries = Object.entries(style.css);
      if (entries.length > 16 || entries.some(([name, value]) => !/^-{0,2}[a-z][a-z0-9-]{0,63}$/.test(name) || typeof value !== "string" || value.length > 200 ||
          /url\s*\(|image-set|image\(|src\s*\(|expression|javascript:|@import|[;{}<>\\"'&]/i.test(value))) formatError("formatting css takes up to 16 plain declarations.");
    }
    const visuals = ["bar", "scale", "bands"].filter(name => style[name] !== undefined);
    if (visuals.length > 1) formatError("a rule draws one of a data bar, a colour scale or threshold bands.");
    if (visuals.length && (rule.target === "row" || !rule.column)) formatError("bars, scales and bands read the rule's column and paint cells.");
    if (style.bar !== undefined) {
      formatKeys(style.bar, ["minimum", "maximum", "tone", "showValue"], "data bar");
      formatFinite(style.bar.minimum); formatFinite(style.bar.maximum);
      if (style.bar.tone !== undefined) formatTone(style.bar.tone);
      if (style.bar.showValue !== undefined && typeof style.bar.showValue !== "boolean" || style.bar.minimum >= style.bar.maximum) formatError("invalid data bar.");
    }
    if (style.scale !== undefined) {
      formatKeys(style.scale, ["stops"], "colour scale");
      const stops = style.scale.stops;
      if (!Array.isArray(stops) || stops.length < 2 || stops.length > 3) formatError("a colour scale has two or three stops.");
      for (const stop of stops) {
        formatKeys(stop, ["type", "value", "tone"], "colour scale stop"); formatTone(stop.tone); formatFinite(stop.value);
        if (!["min", "max", "number", "percent"].includes(stop.type) || (stop.type === "number" || stop.type === "percent") !== (stop.value !== undefined) ||
            stop.type === "percent" && (stop.value < 0 || stop.value > 100)) formatError("invalid colour scale stop.");
      }
    }
    if (style.bands !== undefined) {
      const bands = style.bands;
      if (!Array.isArray(bands) || !bands.length || bands.length > 16) formatError("threshold bands are 1 to 16 bands.");
      bands.forEach((band, index) => {
        formatKeys(band, ["upperBound", "tone", "label", "icon"], "threshold band"); formatTone(band.tone); formatText(band.label, 64); formatIcon(band.icon);
        formatFinite(band.upperBound);
        if (band.upperBound === undefined && index !== bands.length - 1 || index && band.upperBound !== undefined && bands[index - 1].upperBound >= band.upperBound)
          formatError("threshold bands rise, and only the last may be open.");
      });
    }
    if (!["tone", "icon", "badge", "cue", "className", "css", ...visuals].some(name => style[name] !== undefined && style[name] !== "none"))
      formatError("a formatting rule needs a style.");
  }
  // Compiles a list of rules for a grid: identities are unique, columns are declared, conditions compile within their bounds.
  function formatCompile(rules, grid) {
    if (!Array.isArray(rules) || rules.length > 64) formatError("a grid has at most 64 formatting rules.");
    const columns = new Map(grid.columns.map(column => [column.id, column])), ids = new Set();
    return rules.map((rule, index) => {
      formatKeys(rule, ["id", "label", "description", "enabled", "when", "column", "target", "columns", "details", "style", "stopIfTrue"], "formatting rule");
      if (typeof rule.id !== "string" || !/^[A-Za-z0-9][\w.:-]{0,63}$/.test(rule.id) || ids.has(rule.id)) formatError("formatting rules need unique identifiers.");
      ids.add(rule.id); formatText(rule.label, 200); formatText(rule.description, 1000);
      const target = rule.target ?? "cell";
      if (!["cell", "row", "columns"].includes(target) || ["enabled", "details", "stopIfTrue"].some(name => rule[name] !== undefined && typeof rule[name] !== "boolean") ||
          rule.column !== undefined && !columns.has(rule.column) || target === "cell" && rule.column === undefined)
        formatError("formatting rule '" + rule.id + "' needs a declared column for its target.");
      const targets = target === "columns" ? rule.columns : target === "cell" ? [rule.column] : [];
      if (target === "columns" ? !Array.isArray(targets) || !targets.length || targets.length > 64 || new Set(targets).size !== targets.length || targets.some(id => !columns.has(id)) : rule.columns !== undefined)
        formatError("formatting rule '" + rule.id + "' names its columns once each.");
      formatStyle(rule.style, { target, column: rule.column });
      const budget = { predicates: 0, groups: 0 }, test = rule.when === undefined ? null : formatGroup(rule.when, columns, budget, 1);
      return { id: rule.id, index, label: rule.label, description: rule.description || rule.label || rule.id, enabled: rule.enabled !== false, test, target,
        column: rule.column, columns: targets, details: rule.details !== false, stop: !!rule.stopIfTrue, style: rule.style, relative: !!budget.relative };
    });
  }
  function formatOptions(options) {
    if (options === undefined) return {};
    formatKeys(options, ["legend", "editor"], "formatting options");
    if (["legend", "editor"].some(name => options[name] !== undefined && typeof options[name] !== "boolean")) formatError("formatting options are booleans.");
    return { legend: !!options.legend, editor: !!options.editor };
  }
