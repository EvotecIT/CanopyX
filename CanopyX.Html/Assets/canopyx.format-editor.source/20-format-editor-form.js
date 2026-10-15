  // ---------- one rule's form: name, what it draws, where it applies, when, and its style ----------
  const FORMAT_TONES = ["danger", "warning", "success", "info", "neutral", "muted"];
  // A labelled control; a group (the style segment) names itself and sits under a plain heading instead of a label.
  function formatField(text, control, className) {
    const label = control.tagName === "DIV" ? h("div") : gridInputLabel(text, control);
    if (control.tagName === "DIV") { const heading = h("span"); setText(heading, text); heading.setAttribute("aria-hidden", "true"); label.append(heading, control); }
    label.classList.add("cx-format-field"); if (className) label.classList.add(className);
    if (control.tagName === "SELECT" || control.tagName === "INPUT" && control.type !== "checkbox") control.classList.add("cx-input");
    return label;
  }
  function formatSelect(options, value) {
    const select = h("select");
    for (const [key, text] of options) select.appendChild(gridOption(key, text));
    if (value !== undefined && options.some(option => option[0] === value)) select.value = value;
    return select;
  }
  function formatNumberInput(value, placeholder) {
    const input = h("input"); input.type = "number"; input.step = "any"; if (placeholder) input.placeholder = placeholder;
    if (value !== undefined && value !== null) input.value = String(value);
    return input;
  }
  const formatNumberValue = input => input.value.trim() === "" ? undefined : Number(input.value);
  function formatSegment(options, value, label, onChange) {
    const segment = h("div", "cx-seg"); segment.setAttribute("role", "group"); segment.setAttribute("aria-label", label); segment._value = value;
    const sync = () => { for (const button of segment.children) { const on = button.dataset.cxValue === segment._value; button.setAttribute("aria-pressed", String(on)); button.classList.toggle("on", on); } };
    for (const [key, text] of options) { const button = gridButton(text, () => { segment._value = key; sync(); onChange(key); }); button.dataset.cxValue = key; segment.appendChild(button); }
    sync(); return segment;
  }
  Object.assign(DataGrid.prototype, {
    formatToneOptions(rules) {
      const labels = this.formatLabels, own = new Set(FORMAT_TONES);
      const used = JSON.stringify(rules).match(/"tone":"([a-z][a-z0-9-]{0,31})"/g) || [];
      for (const entry of used) own.add(entry.slice(8, -1));
      return [...own].map(tone => [tone, labels["formatTone" + tone[0].toUpperCase() + tone.slice(1)] || tone]);
    },
    renderFormatRule(editor, index) {
      const labels = this.formatLabels, original = index >= 0 ? editor.rules[index] : null, ids = new Set(editor.rules.map(rule => rule.id));
      let id = "rule-1"; for (let n = 1; ids.has(id); n++) id = "rule-" + n;
      const firstNumber = this.columns.find(column => column.kind === "number") || this.columns[0];
      const rule = original ? JSON.parse(JSON.stringify(original)) : { id, column: this.columns[0].id, style: { tone: "warning" } }, style = rule.style || {};
      const tones = this.formatToneOptions(editor.rules), columnOptions = this.columns.map(column => [column.id, column.title]);
      editor.back = () => editor.list(original ? "edit:" + index : "add");
      setText(editor.title, original ? fill(labels.formatEditRule, { rule: rule.label || fill(labels.formatRule, { number: index + 1 }) }) : labels.formatAddRule);
      const form = h("form", "cx-format-form cx-fb"), name = h("input"), description = h("input");
      name.type = description.type = "text"; name.maxLength = 200; description.maxLength = 1000; name.value = rule.label || ""; description.value = rule.description || "";
      let kind = style.bar ? "bar" : style.scale ? "scale" : style.bands ? "bands" : "highlight";
      const kinds = formatSegment([["highlight", labels.formatHighlight], ["bar", labels.formatDataBar], ["scale", labels.formatColorScale], ["bands", labels.formatBands]], kind, labels.formatStyle, next => {
        kind = next; if (kind !== "highlight" && target.value === "row") target.value = "cell";
        if (kind !== "highlight" && this.columns.find(item => item.id === column.value)?.kind !== "number") column.value = firstNumber.id;
        sync(); renderStyle({}, true);
      });
      kinds.classList.add("cx-format-kind");
      const column = formatSelect(columnOptions, rule.column), target = formatSelect([["cell", labels.formatTargetCell], ["row", labels.formatTargetRow], ["columns", labels.formatTargetColumns]], rule.target || "cell");
      const chosen = h("fieldset", "cx-format-columns"), legend = h("legend"); setText(legend, labels.formatTargetColumns); chosen.appendChild(legend);
      for (const item of this.columns) {
        const check = h("input"); check.type = "checkbox"; check.value = item.id; check.checked = (rule.columns || []).includes(item.id);
        chosen.appendChild(gridInputLabel(item.title, check));
      }
      const when = h("input"), conditions = h("div", "cx-format-conditions"), styleBox = h("div", "cx-format-style");
      when.type = "checkbox"; when.checked = !!rule.when;
      const builder = this.formatConditionBuilder(conditions, rule.when || { operator: "and", filters: [], groups: [] });
      const columnField = formatField(labels.formatName, name), targetField = formatField(labels.formatApplyTo, target), sourceField = formatField(this.labels.gridColumn, column);
      const sync = () => {
        target.querySelector('option[value="row"]').hidden = kind !== "highlight";
        sourceField.hidden = target.value === "row" || target.value === "columns" && kind === "highlight";
        chosen.hidden = target.value !== "columns"; conditions.hidden = !when.checked;
      };
      target.addEventListener("change", sync); when.addEventListener("change", () => { sync(); if (when.checked) builder.focus(); });
      let readStyle = () => ({});
      // A style the form does not show (classes, declarations, a hidden value, percentage stops) is kept as it was;
      // a new style starts with the warning tone.
      const extras = current => ({ ...(current.className ? { className: current.className } : {}), ...(current.css ? { css: current.css } : {}) });
      const renderStyle = (current, fresh) => {
        styleBox.replaceChildren();
        const tone = (value, fallback, text = labels.formatTone) => { const select = formatSelect(tones, value || fallback); styleBox.appendChild(formatField(text, select)); return select; };
        if (kind === "highlight") {
          const toneSelect = formatSelect([["", "—"], ...tones], current.tone ?? (fresh ? "warning" : ""));
          const emphasis = formatSelect([["fill", labels.formatFill], ["text", labels.formatTextOnly], ["strong", labels.formatStrong]], current.emphasis || "fill");
          const icons = [["auto", labels.formatAutomatic], ["none", labels.formatNoIcon], ...Object.entries(FORMAT_ICONS).map(([key, glyph]) => [key, glyph])];
          if (current.icon && !icons.some(([name]) => name === current.icon)) icons.push([current.icon, current.icon]);
          const icon = formatSelect(icons, current.icon || "auto");
          const badge = h("input"), cue = h("input"); badge.type = cue.type = "text"; badge.maxLength = cue.maxLength = 64; badge.value = current.badge || ""; cue.value = current.cue || "";
          styleBox.append(formatField(labels.formatTone, toneSelect), formatField(labels.formatEmphasis, emphasis), formatField(labels.formatIcon, icon),
            formatField(labels.formatBadge, badge), formatField(labels.formatCue, cue));
          readStyle = () => {
            const out = {};
            if (toneSelect.value) { out.tone = toneSelect.value; if (emphasis.value !== "fill") out.emphasis = emphasis.value; }
            if (icon.value !== "auto") out.icon = icon.value;
            if (badge.value.trim()) out.badge = badge.value.trim();
            if (cue.value.trim()) out.cue = cue.value.trim();
            return { ...out, ...extras(current) };
          };
        } else if (kind === "bar") {
          const bar = current.bar || {}, select = tone(bar.tone, "info");
          const low = formatNumberInput(bar.minimum, labels.formatAutomatic), high = formatNumberInput(bar.maximum, labels.formatAutomatic);
          styleBox.append(formatField(labels.formatLowest, low), formatField(labels.formatHighest, high));
          readStyle = () => ({ ...extras(current), bar: { tone: select.value, ...(bar.showValue === false ? { showValue: false } : {}), ...(formatNumberValue(low) === undefined ? {} : { minimum: formatNumberValue(low) }),
            ...(formatNumberValue(high) === undefined ? {} : { maximum: formatNumberValue(high) }) } });
        } else if (kind === "scale") {
          const valueLabel = text => text + " · " + this.labels.gridConditionValue;
          const stops = current.scale ? current.scale.stops : [], first = stops[0] || {}, last = stops[stops.length - 1] || {}, middle = stops.length === 3 ? stops[1] : null;
          const lowTone = tone(first.tone, "success", labels.formatLowest), low = formatNumberInput(first.type === "number" ? first.value : undefined, labels.formatAutomatic);
          styleBox.appendChild(formatField(valueLabel(labels.formatLowest), low, "cx-format-value"));
          const midTone = formatSelect([["", "—"], ...tones], middle ? middle.tone : ""), mid = formatNumberInput(middle && middle.type === "number" ? middle.value : undefined, "50%");
          styleBox.append(formatField(labels.formatMidpoint, midTone), formatField(valueLabel(labels.formatMidpoint), mid, "cx-format-value"));
          const highTone = tone(last.tone, "danger", labels.formatHighest), high = formatNumberInput(last.type === "number" ? last.value : undefined, labels.formatAutomatic);
          styleBox.appendChild(formatField(valueLabel(labels.formatHighest), high, "cx-format-value"));
          const stop = (input, type, toneValue, fallback, previous) => formatNumberValue(input) === undefined ?
            previous && previous.type === "percent" ? { type: "percent", value: previous.value, tone: toneValue } : { type, ...(fallback === undefined ? {} : { value: fallback }), tone: toneValue } :
            { type: "number", value: formatNumberValue(input), tone: toneValue };
          readStyle = () => ({ ...extras(current), scale: { stops: [stop(low, "min", lowTone.value, undefined, stops.length ? first : null), ...(midTone.value ? [stop(mid, "percent", midTone.value, 50, middle)] : []),
            stop(high, "max", highTone.value, undefined, stops.length ? last : null)] } });
        } else this.formatBandsEditor(styleBox, current.bands || [{ upperBound: 100, tone: "success" }, { tone: "danger" }], tones, read => { readStyle = () => ({ ...extras(current), ...(current.icon && current.bands ? { icon: current.icon } : {}), bands: read() }); });
      };
      renderStyle(style, !original);
      const whenField = gridInputLabel(labels.formatOnlyRowsWhere, when); whenField.classList.add("cx-format-when");
      form.append(columnField, formatField(labels.formatDescription, description), formatField(labels.formatStyle, kinds, "cx-format-kinds"), targetField, sourceField, chosen, whenField, conditions, styleBox);
      sync();
      const save = () => {
        const next = { id: rule.id };
        if (name.value.trim()) next.label = name.value.trim();
        if (description.value.trim()) next.description = description.value.trim();
        if (rule.enabled === false) next.enabled = false;
        if (target.value !== "cell") next.target = target.value;
        if (!sourceField.hidden) next.column = column.value;
        if (target.value === "columns") next.columns = [...chosen.querySelectorAll("input:checked")].map(check => check.value);
        if (rule.details === false) next.details = false;
        if (rule.stopIfTrue) next.stopIfTrue = true;
        try {
          if (when.checked) next.when = builder.read();
          next.style = readStyle();
          const rules = editor.rules.slice(); if (original) rules[index] = next; else rules.push(next);
          formatCompile(rules, this);
          editor.rules = rules;
        } catch (error) { setText(editor.status, labels.formatInvalid + " " + String(error.message).replace(/^CanopyX: /, "")); return; }
        editor.apply().then(ok => editor.list(ok ? "edit:" + (original ? index : editor.rules.length - 1) : null));
      };
      form.addEventListener("submit", event => { event.preventDefault(); save(); });
      editor.body.replaceChildren(form); editor.foot.replaceChildren(gridButton(labels.formatCancel, () => editor.back()), gridButton(labels.formatSave, save));
      setText(editor.status, ""); name.focus({ preventScroll: true });
    }
  });
