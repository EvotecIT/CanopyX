  // ---------- painting: cells, rows, the phone "+N" button and the record drawer ----------
  // The part paints after the core's own highlights, on the row's recycled cells. What it adds (classes, custom
  // properties, icon, badge, cue and description elements) is recorded per cell and removed before the next paint, and
  // the cell's slot is marked so the core rewrites its classes, so a recycled row never keeps another row's formatting.
  const FORMAT_RANK = { danger: 5, warning: 4, info: 3, success: 2, neutral: 1, muted: 1 };
  function formatUndo(fx) {
    for (const node of fx.nodes) node.remove();
    for (const name of fx.props) fx.element.style.removeProperty(name);
    for (const name of fx.classes) fx.element.classList.remove(name);
  }
  function formatClearSlot(slot) {
    if (slot.fx) { formatUndo(slot.fx); slot.fx = null; }
    for (const child of slot.childSlots || []) formatClearSlot(child);
  }
  function formatClear(element) {
    for (const slot of element._cells || []) if (slot) formatClearSlot(slot);
    if (element._fx) { formatUndo(element._fx); element._fx = null; }
  }
  function formatEffects(element) { return { element, nodes: [], props: [], classes: [] }; }
  // Decorates one element (a grid cell, a drawer value) with a target's style; before is where the icon goes.
  function formatDecorate(element, target, fx, before, emphasis) {
    const add = name => { if (!element.classList.contains(name)) { element.classList.add(name); fx.classes.push(name); } };
    const prop = (target, name, value) => { target.style.setProperty(name, value); if (target === element) fx.props.push(name); };
    const node = (tag, className, text) => { const item = h(tag, className); if (text) setText(item, text); fx.nodes.push(item); return item; };
    // Over a bar or a scale a tone colours only the text.
    if (target.tone && emphasis) { add("cx-fmt-" + (target.bar || target.scale ? "text" : target.emphasis || emphasis)); prop(element, "--cx-fmt", formatToneVar(target.tone)); }
    if (target.scale) { add("cx-fmt-scale"); prop(element, "--cx-fmt-scale", target.scale); }
    if (target.className) for (const name of target.className.split(/\s+/)) if (name) add(name);
    if (target.css) for (const name of Object.keys(target.css)) prop(element, name, target.css[name]);
    if (target.glyph) {
      const icon = node("span", "cx-fmt-icon", target.glyph); icon.setAttribute("aria-hidden", "true");
      if (target.tone) prop(icon, "--cx-fmt", formatToneVar(target.tone));
      element.insertBefore(icon, before && before.parentNode === element ? before : element.firstChild);
    }
    if (target.bar) {
      add("cx-fmt-barred"); if (!target.bar.show) add("cx-fmt-novalue");
      const bar = node("span", "cx-fmt-bar"); bar.setAttribute("aria-hidden", "true");
      prop(bar, "--cx-fmt-w", (target.bar.width * 100).toFixed(1) + "%"); prop(bar, "--cx-fmt", formatToneVar(target.bar.tone));
      element.insertBefore(bar, element.firstChild);
    }
    if (target.badge) {
      const badge = node("span", "cx-badge cx-fmt-badge", target.badge), tone = toneOf(target.tone || "neutral");
      badge.className += tone.cls; if (tone.host) { prop(badge, "--cx-t", "var(--cx-tone-" + tone.host + ")"); prop(badge, "--cx-t-bg", "var(--cx-tone-" + tone.host + "-bg)"); }
      element.appendChild(badge);
    }
    if (target.cue) element.appendChild(node("span", "cx-fmt-cue", target.cue));
    if (target.descriptions && target.descriptions.length) element.appendChild(node("span", "cx-sr-only", ", " + target.descriptions.join(", ")));
  }
  // The cues of a row target, without its colour, go into the row's first cell.
  const formatCues = target => ({ glyph: target.glyph, badge: target.badge, cue: target.cue, tone: target.tone, descriptions: target.descriptions });
  const FORMAT_PAINT = DataGrid.prototype.paintGridHighlights;
  DataGrid.prototype.paintGridHighlights = function (element, row) {
    FORMAT_PAINT.call(this, element, row);
    formatClear(element);
    const result = !row.status && this.formatResult && this.formatResult(row.h);
    if (!result) return;
    const slots = element._cells, first = slots[0];
    if (result.row) {
      // A row rule tints the row and gives it its classes and declarations; its cues go into the first cell.
      const own = result.row;
      if (own.tone || own.className || own.css) {
        const fx = element._fx = formatEffects(element);
        setClass(element, element._cls + (own.tone ? " cx-fmt-row" : "") + (own.className ? " " + own.className : ""));
        if (own.tone) { element.style.setProperty("--cx-fmt", formatToneVar(own.tone)); fx.props.push("--cx-fmt"); }
        if (own.css) for (const name of Object.keys(own.css)) { element.style.setProperty(name, own.css[name]); fx.props.push(name); }
      }
      if (first) { first.fx = formatEffects(first.cell); first.highlighted = true; formatDecorate(first.cell, formatCues(result.row), first.fx, first.textSpan); }
    }
    // Compact record values are the same fields, projected into child slots below the identity.
    const columns = this.cols.concat(this.phoneLineColumns()), paintSlots = slots.concat(first?.childSlots || []);
    for (let i = 0; i < columns.length; i++) {
      const target = result.cells.get(columns[i].id), slot = paintSlots[i];
      if (!target || !slot) continue;
      if (!slot.fx || slot.fx.element !== slot.cell) slot.fx = formatEffects(slot.cell);
      slot.highlighted = true;
      formatDecorate(slot.cell, target, slot.fx, slot.textSpan, "fill");
    }
    if (first && first.hiddenFields) {
      const details = this.formatResult(row.h, true);
      if (details) this.formatHiddenFields(first, details);
    }
  };
  // The phone "+N" button names the flagged fields it hides (a tone, an icon, a badge or a cue; bars and scales are not
  // flags) and takes the strongest tone among them.
  const formatFlag = target => target && target.details && (target.tone || target.glyph || target.badge || target.cue);
  DataGrid.prototype.formatHiddenFields = function (slot, result) {
    const button = slot.hiddenFields, hidden = this.phoneRemainingColumns().filter(column => formatFlag(result.cells.get(column.id)));
    if (!hidden.length) return;
    let tone = null;
    for (const column of hidden) { const next = result.cells.get(column.id).tone; if (next && (FORMAT_RANK[next] || 3) > (FORMAT_RANK[tone] || 0)) tone = next; }
    const fx = slot.fx || (slot.fx = formatEffects(slot.cell)), effects = formatEffects(button), label = button.getAttribute("aria-label");
    let decorated;
    fx.nodes.push({ remove() { formatUndo(effects); if (button.getAttribute("aria-label") === decorated) button.setAttribute("aria-label", label); } });
    effects.classes.push("cx-fmt-flag"); button.classList.add("cx-fmt-flag");
    button.style.setProperty("--cx-fmt", tone ? formatToneVar(tone) : "var(--cx-text-2)"); effects.props.push("--cx-fmt");
    const rules = [...new Set(hidden.flatMap(column => result.cells.get(column.id).descriptions))].join(", ");
    decorated = label + ". " + fill(this.formatLabels.formatHiddenFlagged, { count: hidden.length, rules });
    button.setAttribute("aria-label", decorated);
  };
