  // ---------- the rule editor: a dialog that lists a grid's rules and edits one on the filter builder's condition rows ----------
  // It ships in canopyx-format-editor.js and requires the filter editor part, whose condition rows (addGridFilter and
  // readGridFilter) and styles it reuses, and the formatting part, whose validation (formatCompile) checks a rule before it
  // is saved. Changes in the list (on/off, order, delete, the legend switch) apply at once; a rule's form applies on Save.
  // Every change goes through setFormatRules, so the rules land in the grid state and its saved views.
  const FORMAT_EDITOR_LABELS = { formatRule: "Rule {number}", formatAddRule: "Add rule",
    formatEditRule: "Edit {rule}", formatDeleteRule: "Delete {rule}", formatMoveUp: "Move {rule} up", formatMoveDown: "Move {rule} down",
    formatEnableRule: "Apply {rule}", formatNoRules: "No formatting rules.", formatName: "Name", formatDescription: "Screen reader description",
    formatOnlyRowsWhere: "Only rows where", formatEveryRow: "Every row", formatNone: "None", formatApplyTo: "Apply to", formatTargetCell: "Cell",
    formatTargetRow: "Whole row", formatTargetColumns: "Chosen columns", formatStyle: "Style", formatHighlight: "Highlight", formatDataBar: "Data bar",
    formatColorScale: "Colour scale", formatBands: "Threshold bands", formatTone: "Tone", formatEmphasis: "Emphasis", formatFill: "Fill",
    formatTextOnly: "Text colour", formatStrong: "Bold fill", formatIcon: "Icon", formatNoIcon: "No icon", formatAutomatic: "Automatic",
    formatBadge: "Badge", formatCue: "Text cue", formatLowest: "Lowest", formatMidpoint: "Midpoint", formatHighest: "Highest", 
    formatAddBand: "+ Band", formatRemoveBand: "Remove band", formatSave: "Save rule", formatCancel: "Cancel",
    formatShowLegend: "Show legend", formatInvalid: "Complete the rule before saving.", formatMatchCase: "Match case",
    formatToneDanger: "Danger", formatToneWarning: "Warning",
    formatToneSuccess: "Success", formatToneInfo: "Info", formatToneNeutral: "Neutral", formatToneMuted: "Muted", formatNotContains: "does not contain",
    formatEndsWith: "ends with", formatNotIn: "is none of", formatBetween: "between", formatLike: "matches wildcard", formatMatches: "matches pattern",
    formatOlderThan: "older than (days)", formatWithinLast: "within the last (days)", formatNotLike: "does not match wildcard",
    formatNotMatches: "does not match pattern", formatBetweenExclusive: "between (exclusive)" };
  function formatIconButton(label, icon, run) {
    const button = gridDecorateButton(gridButton("", run), icon === "edit" ? "more" : icon, true);
    if (icon === "edit") button.querySelector("svg").replaceWith(svgIcon('<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>'));
    button.classList.add("icon"); button.setAttribute("aria-label", label); button.title = label;
    return button;
  }
  // A small preview of a rule's style: tint and icon, a bar, a gradient, or the bands' tones.
  function formatPreview(style) {
    const swatch = h("span", "cx-format-swatch"), stops = style.scale ? style.scale.stops.map(stop => stop.tone) : style.bands ? style.bands.map(band => band.tone) : null;
    swatch.setAttribute("aria-hidden", "true");
    if (stops) { swatch.classList.add("cx-fmt-gradient"); swatch.style.setProperty("--cx-fmt-scale", "linear-gradient(90deg," + stops.map(formatToneVar).join(",") + ")"); }
    else if (style.bar) { swatch.classList.add("cx-fmt-barred"); const bar = h("span", "cx-fmt-bar"); bar.style.setProperty("--cx-fmt-w", "70%"); bar.style.setProperty("--cx-fmt", formatToneVar(style.bar.tone || "info")); swatch.appendChild(bar); }
    else if (style.tone) {
      swatch.classList.add("cx-fmt-fill"); swatch.style.setProperty("--cx-fmt", formatToneVar(style.tone));
      const name = !style.icon || style.icon === "auto" ? FORMAT_TONE_ICONS[style.tone] || "dot" : style.icon;
      if (name !== "none") setText(swatch, FORMAT_ICONS[name] || name);
    } else if (style.badge) setText(swatch, style.badge.slice(0, 2));
    return swatch;
  }
  Object.assign(DataGrid.prototype, {
    showFormatEditor() {
      this.formatEditor?.close();
      if (!this.formatLabels.formatAddRule) {
        const own = {};
        for (const name of Object.keys(FORMAT_EDITOR_LABELS)) own[name] = Object.hasOwn(this.labels, name) ? this.labels[name] : FORMAT_EDITOR_LABELS[name];
        this.formatLabels = { ...this.formatLabels, ...own };
      }
      const labels = this.formatLabels, returnFocus = document.activeElement, phone = this.host.clientWidth <= 640;
      const dialog = h("dialog", "cx-host cx-grid-overlay cx-format-editor"), head = h("div", "cx-drawer-h"), title = h("h4"), body = h("div", "cx-format-body"),
        status = h("p", "cx-grid-control-error"), foot = h("div", "cx-pop-f");
      overlayTheme(this.host, dialog); dialog.classList.toggle("cx-phone", phone);
      title.id = this.id + "-format-title"; title.tabIndex = -1; setText(title, labels.formatRules); dialog.setAttribute("aria-labelledby", title.id);
      status.setAttribute("role", "status");
      head.append(title, formatIconButton(labels.formatCancel, "close", () => dialog.close()));
      dialog.append(head, body, status, foot); document.body.appendChild(dialog); this.formatEditor = dialog;
      const editor = { dialog, body, foot, status, title, rules: JSON.parse(JSON.stringify(this.getFormatRules())) };
      editor.apply = () => this.setFormatRules(editor.rules).then(() => { setText(status, ""); return true; }, error => { setText(status, error.message); return false; });
      editor.list = focus => this.renderFormatList(editor, focus);
      dialog.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (editor.back) editor.back(); else dialog.close(); } });
      dialog.addEventListener("close", () => {
        dialog.remove(); if (this.formatEditor === dialog) this.formatEditor = null;
        if (!this.destroyed) (returnFocus?.isConnected && returnFocus.checkVisibility?.() ? returnFocus : this.grid).focus({ preventScroll: true });
      }, { once: true });
      const owner = new AbortController();
      this.lifetime.signal.addEventListener("abort", () => dialog.close(), { once: true, signal: owner.signal });
      dialog.addEventListener("close", () => owner.abort(), { once: true });
      announceMenu(dialog); dialog.showModal(); editor.list(); title.focus({ preventScroll: true });
      return dialog;
    },
    renderFormatList(editor, focus) {
      const labels = this.formatLabels, { body, foot, rules } = editor, name = (rule, index) => rule.label || fill(labels.formatRule, { number: index + 1 });
      editor.back = null; setText(editor.title, labels.formatRules); body.replaceChildren(); foot.replaceChildren();
      const list = h("ol", "cx-format-rules");
      list.setAttribute("aria-label", labels.formatRules);
      const change = (mutate, next) => { mutate(); editor.apply().then(ok => { if (!ok) editor.rules = JSON.parse(JSON.stringify(this.getFormatRules())); editor.list(next); }); };
      rules.forEach((rule, index) => {
        const item = h("li", "cx-format-item"), toggle = h("input"), text = h("span", "cx-format-item-text"), title = h("b"), summary = h("span", "cx-muted"), actions = h("span", "cx-format-actions");
        const label = name(rule, index);
        toggle.type = "checkbox"; toggle.checked = rule.enabled !== false; toggle.setAttribute("aria-label", fill(labels.formatEnableRule, { rule: label }));
        toggle.addEventListener("change", () => change(() => { if (toggle.checked) delete rule.enabled; else rule.enabled = false; }, "toggle:" + index));
        setText(title, label); setText(summary, this.formatSummary(rule)); text.append(title, summary);
        const move = (by, key) => () => change(() => rules.splice(index + by, 0, rules.splice(index, 1)[0]), key + ":" + (index + by));
        const up = formatIconButton(fill(labels.formatMoveUp, { rule: label }), "up", move(-1, "up")), down = formatIconButton(fill(labels.formatMoveDown, { rule: label }), "down", move(1, "down"));
        up.disabled = index === 0; down.disabled = index === rules.length - 1;
        const edit = formatIconButton(fill(labels.formatEditRule, { rule: label }), "edit", () => this.renderFormatRule(editor, index));
        edit.dataset.cxFocus = "edit:" + index;
        const remove = formatIconButton(fill(labels.formatDeleteRule, { rule: label }), "close", () => change(() => rules.splice(index, 1), "add"));
        toggle.dataset.cxFocus = "toggle:" + index; up.dataset.cxFocus = "up:" + index; down.dataset.cxFocus = "down:" + index;
        actions.append(up, down, edit, remove); item.append(toggle, formatPreview(rule.style || {}), text, actions); list.appendChild(item);
      });
      if (rules.length) body.appendChild(list);
      else { const empty = h("p", "cx-muted"); setText(empty, labels.formatNoRules); body.appendChild(empty); }
      const add = gridButton(labels.formatAddRule, () => this.renderFormatRule(editor, -1)); add.classList.add("cx-link"); add.dataset.cxFocus = "add";
      add.disabled = rules.length >= 64;
      const legend = h("input"), legendLabel = gridInputLabel(labels.formatShowLegend, legend);
      legend.type = "checkbox"; legend.checked = !!this.formatLegendShown; legendLabel.classList.add("cx-format-legend-switch");
      legend.addEventListener("change", () => this.setFormatLegend(legend.checked));
      const done = gridButton(this.labels.gridDone, () => editor.dialog.close());
      foot.append(add, legendLabel, done);
      const target = focus && editor.dialog.querySelector('[data-cx-focus="' + focus + '"]');
      if (target && !target.disabled) target.focus({ preventScroll: true }); else if (focus) add.focus({ preventScroll: true });
    },
    // "Cell · CPU · Data bar": where a rule applies and what it draws.
    formatSummary(rule) {
      const labels = this.formatLabels, title = id => this.columns.find(column => column.id === id)?.title || id, style = rule.style || {};
      const target = rule.target === "row" ? labels.formatTargetRow : rule.target === "columns" ? (rule.columns || []).map(title).join(", ") : labels.formatTargetCell + " · " + title(rule.column);
      const kind = style.bar ? labels.formatDataBar : style.scale ? labels.formatColorScale : style.bands ? labels.formatBands : labels.formatHighlight;
      return [target, kind, rule.when ? null : labels.formatEveryRow].filter(Boolean).join(" · ");
    }
  });
