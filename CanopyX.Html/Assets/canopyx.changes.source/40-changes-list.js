  // ---------- changes: the change list, its filters and its state ----------
  // A bar of kind filters (each kind that occurs, with its count) and a "Flagged only" switch sit above the items, grouped under
  // their folders. The state is plain data, raised as canopyx:changesState and accepted back by setState. CanopyX never acts on an
  // item: an action raises canopyx:changeAction for the host, and a copy action writes one of the item's values to the clipboard.
  class ChangeListView {
    constructor(host, options) {
      this.host = host; this.options = options; this.lifetime = new AbortController();
      this.doc = changesDocument(options.view);
      this.labels = changeLabels(this.doc.labels, options.labels);
      this.lang = host.closest("[lang]")?.getAttribute("lang") || document.documentElement.lang || "en";
      this.format = numberFormat(this.lang);
      this.kinds = new Set(); this.flaggedOnly = this.doc.flaggedOnly; this.limit = this.doc.pageSize; this.diffs = new Map();
      this.open = new Set(this.doc.expandFlagged ? this.doc.items.filter(item => item.flags.length).map(item => item.id) : []);
      if (options.state) this.applyState(options.state, false);
      this.build();
    }
    emit(name, detail, callback) {
      const event = new CustomEvent("canopyx:" + name, { detail, bubbles: true });
      this.host.dispatchEvent(event);
      if (typeof this.options[callback] === "function") { try { this.options[callback](detail, event); } catch (error) { this.host.dispatchEvent(new CustomEvent("canopyx:error", { detail: { error, hook: callback }, bubbles: true })); } }
    }
    build() {
      const signal = this.lifetime.signal;
      if (!this.host.closest("[data-cx-theme]")) { this.host.setAttribute("data-cx-theme", "auto"); this.addedTheme = true; }
      const root = this.root = h("div", "cx-changes");
      this.bar = h("div", "cx-chg-bar");
      this.list = h("ul", "cx-chg-list"); this.list.setAttribute("aria-label", this.doc.label);
      this.empty = h("div", "cx-chg-empty"); this.empty.hidden = true;
      this.more = h("button", "cx-chg-more"); this.more.type = "button"; this.more.hidden = true;
      this.live = h("div", "cx-sr-only"); this.live.setAttribute("aria-live", "polite");
      this.barPanel = h("div", "cx-chg-barpanel");
      root.append(this.bar, this.barPanel, this.list, this.empty, this.more, this.live);
      this.host.appendChild(root);
      root.addEventListener("click", event => this.onClick(event), { signal });
      root.addEventListener("keydown", event => this.onKey(event), { signal });
      root.addEventListener("change", event => { if (event.target === this.flagSwitch) this.applyState({ flaggedOnly: event.target.checked }); }, { signal });
      this.more.addEventListener("click", () => { this.limit += this.doc.pageSize; this.render(); }, { signal });
      // Paper shows every item the filters keep (up to 2,000), and says which filters are in effect.
      this.printing = changesInPrint();
      global.addEventListener("beforeprint", () => { this.printing = true; this.render(); }, { signal });
      global.addEventListener("afterprint", () => { this.printing = false; this.render(); }, { signal });
      this.render();
    }
    /** The items the filters keep, in the list's order: by folder when grouped, each folder's items as given. */
    visible() {
      return this.doc.items.filter(item => (!this.kinds.size || this.kinds.has(item.kind)) && (!this.flaggedOnly || item.flags.length));
    }
    folders(items) {
      if (!this.doc.groupByFolder) return [["", "", items]];
      const groups = new Map();
      for (const item of items) {
        const folder = changePath(item.path)[0], key = folder.replace(/\\/g, "/");
        if (!groups.has(key)) groups.set(key, [key, folder, []]);
        groups.get(key)[2].push(item);
      }
      return [...groups.values()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    }
    renderBar() {
      const labels = this.labels, items = this.doc.items, kinds = h("div", "cx-chg-kinds");
      kinds.setAttribute("role", "group"); kinds.setAttribute("aria-label", labels.changeFilter);
      for (const kind of CHANGE_KINDS) {
        const count = items.filter(item => item.kind === kind).length;
        if (!count) continue;
        const button = h("button", "cx-chg-kind"), badge = h("span"), number = h("span", "cx-chg-count");
        button.type = "button"; button._kind = kind; button.setAttribute("aria-pressed", String(this.kinds.has(kind)));
        applyTone(badge, "cx-chg-badge", toneOf(CHANGE_TONES[kind])); setText(badge, labels["change" + kind[0].toUpperCase() + kind.slice(1)]);
        setText(number, this.format.format(count)); button.append(badge, number); kinds.appendChild(button);
      }
      const children = [kinds], flagged = items.filter(item => item.flags.length).length;
      if (flagged) {
        const label = h("label", "cx-chg-switch"), box = this.flagSwitch = h("input"), text = h("span");
        box.type = "checkbox"; box.checked = this.flaggedOnly;
        setText(text, labels.changeFlaggedOnly + " · " + changeCount(labels.changeFlaggedCount, flagged, this.lang, { count: this.format.format(flagged) }));
        label.append(box, text); children.push(label);
      }
      const summary = h("span", "cx-chg-summary"), shown = Math.min(this.visible().length, this.shownLimit());
      setText(summary, shown === items.length ? "" : fill(labels.changeShown, { shown: this.format.format(shown), total: this.format.format(items.length) }));
      const filters = [...CHANGE_KINDS.filter(kind => this.kinds.has(kind)).map(kind => labels["change" + kind[0].toUpperCase() + kind.slice(1)]), ...(this.flaggedOnly ? [labels.changeFlaggedOnly] : [])];
      const printed = h("span", "cx-chg-printnote"); setText(printed, filters.length ? fill(labels.changeFiltered, { filters: filters.join(", ") }) : "");
      children.push(summary, printed);
      const tools = this.tools();
      if (tools) children.push(tools);
      this.bar.replaceChildren(...children);
    }
    shownLimit() { return this.printing ? Math.max(this.limit, 2000) : this.limit; }
    render() {
      const focused = document.activeElement && this.root.contains(document.activeElement) ? document.activeElement.closest("[data-cx-item]")?.getAttribute("data-cx-item") : null;
      this.renderBar();
      const items = this.visible(), shown = items.slice(0, this.shownLimit()), labels = this.labels, rows = [];
      for (const [key, folder, members] of this.folders(shown)) {
        if (this.doc.groupByFolder) {
          const group = h("li", "cx-chg-group"), title = h("div", "cx-chg-folder"), name = h("span", "cx-chg-foldername"), count = h("span", "cx-chg-foldercount"), list = h("ul", "cx-chg-sublist");
          setText(name, folder || labels.changeRoot); setText(count, changeCount(labels.changeFileCount, members.length, this.lang, { count: this.format.format(members.length) }));
          title.append(name, count); list.setAttribute("aria-label", folder || labels.changeRoot);
          for (const item of members) list.appendChild(this.row(item));
          group.append(title, list); rows.push(group);
        } else {
          for (const item of members) rows.push(this.row(item));
        }
      }
      for (const [id, diff] of this.diffs) if (!shown.some(item => item.id === id && this.open.has(id))) { diff.destroy(); this.diffs.delete(id); }
      this.list.replaceChildren(...rows);
      this.empty.hidden = items.length > 0; setText(this.empty, labels.changeNoItems);
      this.more.hidden = items.length <= this.shownLimit(); setText(this.more, labels.changeShowMore);
      this.barPanel.replaceChildren(...(this.pending && !this.pending.item ? [this.panel()] : []));
      if (focused) this.focusItem(focused);
    }
    applyState(state, render = true) {
      if (!state || typeof state !== "object") throw new Error("CanopyX: a change list state is an object.");
      if (state.kinds !== undefined) {
        if (!Array.isArray(state.kinds) || state.kinds.some(kind => !CHANGE_KINDS.includes(kind))) throw new Error("CanopyX: change list kinds are added, removed, modified and renamed.");
        this.kinds = new Set(state.kinds);
      }
      if (state.flaggedOnly !== undefined) this.flaggedOnly = !!state.flaggedOnly;
      if (state.open !== undefined) {
        if (!Array.isArray(state.open) || state.open.some(id => typeof id !== "string")) throw new Error("CanopyX: open items are a list of item ids.");
        this.open = new Set(state.open.filter(id => this.doc.items.some(item => item.id === id)));
      }
      this.limit = this.doc.pageSize;
      if (render) { this.render(); this.emit("changesState", this.getState(), "onStateChange"); }
    }
    getState() { return gridFreeze({ kinds: [...this.kinds], flaggedOnly: this.flaggedOnly, open: [...this.open] }); }
    /** Opens or closes an item's details; its diff mounts on first open. */
    toggle(id, open) {
      const item = this.doc.items.find(entry => entry.id === id);
      if (!item) return false;
      const next = open === undefined ? !this.open.has(id) : !!open;
      if (next === this.open.has(id)) return true;
      if (next) this.open.add(id); else this.open.delete(id);
      this.render();
      this.emit("changeToggle", { list: this.doc.id, item: id, open: next }, "onToggle");
      return true;
    }
    focusItem(id) {
      const toggle = [...this.list.querySelectorAll(".cx-chg-toggle")].find(button => button.closest("[data-cx-item]").getAttribute("data-cx-item") === id);
      if (!toggle) return false;
      toggle.focus();
      return true;
    }
    update(view) {
      this.doc = changesDocument(view); this.labels = changeLabels(this.doc.labels, this.options.labels); this.source = view;
      this.open = new Set([...this.open].filter(id => this.doc.items.some(item => item.id === id)));
      for (const diff of this.diffs.values()) diff.destroy();
      this.diffs.clear(); this.limit = this.doc.pageSize; this.pending = null; this.list.setAttribute("aria-label", this.doc.label);
      this.render();
    }
  }
