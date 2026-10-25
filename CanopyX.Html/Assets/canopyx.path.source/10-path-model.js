  const PATH_TEXT = { pathEmpty: "No paths to show", pathSource: "Source", pathTarget: "Target",
    pathStep: "Step {number} of {total}", pathCycle: "Cycle", pathForeign: "Foreign", pathDisabled: "Disabled",
    pathKeys: "Use Tab or arrow keys to browse steps; Enter or Space opens the record.",
    pathPartial: "Showing {shown} of {total} steps." };
  const PATH_FLAGS = { cycle: "warning", foreign: "info", disabled: "muted" };
  function pathKeys(value, allowed) {
    if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error("CanopyX: path settings have an unknown property.");
  }
  function pathText(value, maximum = Infinity) {
    if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return false;
    for (let at = 0; at < value.length; at++) {
      const code = value.charCodeAt(at);
      if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(++at); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
      else if (code >= 0xdc00 && code <= 0xdfff) return false;
    }
    return true;
  }
  function pathSettings(grid) {
    const input = grid.view.path, object = value => value && typeof value === "object" && !Array.isArray(value);
    const known = id => pathText(id) && grid.columns.some(column => column.id === id);
    if (grid.view.protocol !== PROTOCOL || !object(input) || grid.view.source.kind !== "inline" || grid.opts.source ||
        grid.view.rowIdentity === "ordinal" || input.titleColumn !== undefined && !known(input.titleColumn) ||
        !Array.isArray(input.chains) || input.chains.length > 200)
      throw new Error("CanopyX: a path needs inline records with stable identities, a known title column and at most 200 chains.");
    pathKeys(input, ["titleColumn", "chains"]);
    const rows = grid.view.rows;
    if (!Array.isArray(rows)) throw new Error("CanopyX: path records are not available.");
    const records = new Map(), ids = new Set(); let total = 0;
    for (const row of rows) {
      if (!object(row) || !pathText(row.id) || records.has(row.id)) throw new Error("CanopyX: path records need distinct stable identities.");
      records.set(row.id, row);
    }
    for (const chain of input.chains) {
      if (!object(chain) || !pathText(chain.id, 256) || ids.has(chain.id) || !pathText(chain.label, 4096) ||
          !Array.isArray(chain.hops) || chain.hops.length < 1 || chain.hops.length > 256)
        throw new Error("CanopyX: path chains need unique identities, labels and one to 256 steps.");
      pathKeys(chain, ["id", "label", "hops"]);
      ids.add(chain.id); total += chain.hops.length;
      if (total > 10000) throw new Error("CanopyX: a path has at most 10,000 steps in total.");
      for (const hop of chain.hops) {
        if (!object(hop) || !pathText(hop.record) || !records.has(hop.record) || hop.label !== undefined && !pathText(hop.label, 4096) ||
            hop.flags !== undefined && (!Array.isArray(hop.flags) || hop.flags.length > 3 || new Set(hop.flags).size !== hop.flags.length ||
              hop.flags.some(flag => typeof flag !== "string" || !Object.hasOwn(PATH_FLAGS, flag))) ||
            hop.badges !== undefined && (!Array.isArray(hop.badges) || hop.badges.length > 16 || hop.badges.some(badge => !object(badge) ||
              !pathText(badge.text, 256) || badge.title !== undefined && !pathText(badge.title, 4096) ||
              badge.tone !== undefined && (typeof badge.tone !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(badge.tone) || badge.tone.endsWith("-bg")))))
          throw new Error("CanopyX: path steps need existing record references and valid labels, distinct flags and badges.");
        pathKeys(hop, ["record", "label", "flags", "badges"]);
        for (const badge of hop.badges || []) pathKeys(badge, ["text", "tone", "title"]);
      }
    }
    const titleColumn = input.titleColumn || grid.columns.find(column => column.rowHeader)?.id || grid.columns.find(column => !column.hidden)?.id;
    return { ...input, titleColumn, records, total };
  }
  Object.assign(DataGrid.prototype, {
    async startPath() {
      if (this.path) return;
      if (this.view.rowData) await this.source.decoded;
      if (this.destroyed) return;
      const settings = pathSettings(this), labels = {};
      for (const [key, text] of Object.entries(PATH_TEXT)) labels[key] = this.opts.labels?.[key] || this.view.labels?.[key] || text;
      this.path = { settings, labels, rows: [...settings.records.values()] };
      const hidden = this.grid.hidden, pagerHidden = this.pager?.hidden;
      const toolbarHidden = this.toolbar.hidden;
      this.toolbar.hidden = true;
      this.host.classList.add("cx-path-host"); this.grid.hidden = true;
      if (this.pager) this.pager.hidden = true;
      this.pathFrame = h("section", "cx-path"); this.pathFrame.setAttribute("aria-label", this.view.label);
      this.host.insertBefore(this.pathFrame, this.grid.nextSibling);
      this.pathPaint();
      this.host.addEventListener("canopyx:format", () => this.pathPaint(), { signal: this.lifetime.signal });
      this.lifetime.signal.addEventListener("abort", () => {
        this.pathFrame.remove(); this.host.classList.remove("cx-path-host"); this.grid.hidden = hidden;
        this.toolbar.hidden = toolbarHidden;
        if (this.pager) this.pager.hidden = pagerHidden;
        this.path = null;
      }, { once: true });
    }
  });
