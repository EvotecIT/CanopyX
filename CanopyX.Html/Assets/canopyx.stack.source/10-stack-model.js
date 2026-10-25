  const STACK_TEXT = { stackWinner: "Winner", stackEnforced: "Enforced", stackFiltered: "Filtered",
    stackEmpty: "No layers to display.", stackOrder: "Processing order",
    stackTruncated: "{shown} of {total} layers shown in processing order; the winning layer is always included." };
  // Match String.IsNullOrWhiteSpace in the C# authoring API, including U+0085 and excluding U+FEFF.
  const stackHasText = value => typeof value === "string" && /[^\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/.test(value);
  const stackObject = (value, keys) => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
  function stackIdentifier(value) {
    if (!stackHasText(value)) return false;
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(++index); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
      else if (code >= 0xdc00 && code <= 0xdfff) return false;
    }
    return true;
  }
  function stackSettings(grid) {
    const input = grid.view.stack, known = id => grid.columns.some(column => column.id === id);
    if (!stackObject(input, ["titleColumn", "layers"]) || grid.view.source.kind !== "inline" || grid.opts.source || grid.view.rowIdentity === "ordinal" ||
        input.titleColumn !== undefined && (!stackIdentifier(input.titleColumn) || !known(input.titleColumn)) ||
        !Array.isArray(input.layers) || input.layers.length > 1000)
      throw new Error("CanopyX: a stack needs inline records, stable identities, known title columns and at most 1,000 layers.");
    const titleColumn = input.titleColumn || grid.columns.find(column => column.rowHeader)?.id || grid.columns.find(column => !column.hidden)?.id;
    if (!titleColumn) throw new Error("CanopyX: a stack needs a title column.");
    const records = new Map((grid.view.rows || []).map(row => [row.id, row])), ids = new Set(); let winners = 0;
    for (const layer of input.layers) {
      if (!stackObject(layer, ["id", "record", "reason", "label", "winner", "enforced", "filtered", "badges"]) ||
          !stackIdentifier(layer.id) || !stackIdentifier(layer.record) || ids.has(layer.id) || !records.has(layer.record) ||
          !stackHasText(layer.reason) || layer.label !== undefined && typeof layer.label !== "string" ||
          ["winner", "enforced", "filtered"].some(name => layer[name] !== undefined && typeof layer[name] !== "boolean") ||
          layer.badges !== undefined && (!Array.isArray(layer.badges) || layer.badges.some(badge => !stackObject(badge, ["text", "tone", "title"]) || typeof badge.text !== "string" || !badge.text ||
            badge.tone !== undefined && (typeof badge.tone !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(badge.tone) || badge.tone.endsWith("-bg")) || badge.title !== undefined && typeof badge.title !== "string")))
        throw new Error("CanopyX: stack layers need unique ids, existing records, reasons and valid badges.");
      ids.add(layer.id); if (layer.winner) winners++;
      if (layer.winner && layer.filtered) throw new Error("CanopyX: a filtered stack layer cannot be the winner.");
    }
    if (input.layers.length && winners !== 1) throw new Error("CanopyX: a nonempty stack needs exactly one host-supplied winner.");
    return { ...input, titleColumn, records };
  }
  Object.assign(DataGrid.prototype, {
    startStack() {
      if (this.stack) return;
      const settings = stackSettings(this), labels = {};
      for (const [key, text] of Object.entries(STACK_TEXT)) labels[key] = this.opts.labels?.[key] || this.view.labels?.[key] || text;
      this.stack = { settings, labels };
      const previousHidden = this.grid.hidden, pagerHidden = this.pager?.hidden;
      const toolbarHidden = this.toolbar.hidden, originalMaxHeight = this.fitInline ?? this.host.style.maxHeight;
      this.host.style.maxHeight = originalMaxHeight; this.toolbar.hidden = true;
      this.host.classList.add("cx-stack-host"); this.grid.hidden = true;
      if (this.pager) this.pager.hidden = true;
      this.stackFrame = h("section", "cx-stack"); this.stackFrame.setAttribute("aria-label", this.view.label);
      this.host.insertBefore(this.stackFrame, this.grid.nextSibling);
      const repaint = () => {
        try { this.stack.settings = stackSettings(this); this.stackPaint(); }
        catch (error) { this.stackFrame.replaceChildren(); this.setNotice(error.message, true); this.emit("error", { error }); }
      };
      this.host.addEventListener("canopyx:format", repaint, { signal: this.lifetime.signal });
      this.host.addEventListener("canopyx:rowsChanged", repaint, { signal: this.lifetime.signal });
      this.lifetime.signal.addEventListener("abort", () => {
        this.stackFrame.remove(); this.host.classList.remove("cx-stack-host"); this.grid.hidden = previousHidden;
        this.toolbar.hidden = toolbarHidden; this.host.style.maxHeight = originalMaxHeight;
        if (this.pager) this.pager.hidden = pagerHidden;
      }, { once: true });
      this.stackPaint();
    }
  });
