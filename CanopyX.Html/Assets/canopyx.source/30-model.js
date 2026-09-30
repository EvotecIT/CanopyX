
  // ---------- tree grid: model ----------
  // Loaded nodes keep their children. The visible rows are a flat array rebuilt on every structure change, in time
  // proportional to the visible rows. Rows have a fixed height; a detail row spans several row slots, or is as tall
  // as its content when it declares no height.
  class TreeGrid {
    constructor(host, options) {
      const view = checkDocument(options.view, "view");
      requireIdentifier(view.id, "view ID");
      this.host = host;
      this.view = view;
      this.opts = options;
      this.id = "cx" + ++instanceSeq;
      this.source = options.source || sourceFor(view);
      this.rowH = view.rowHeight || 28;
      this.pageSize = view.pageSize || 100;
      this.multi = view.selection === "multiple";
      this.lang = document.documentElement.lang || undefined;
      // Every text the grid writes itself: English, then the view's translations, then the host's.
      this.labels = labelsFor(view.labels, options.labels);
      // Dates show in UTC unless the view, or the host at run time, asks for the reader's own time zone.
      this.local = view.timeZone === "local";
      this.fmt = formatting(this.lang, this.local, this.labels);
      if (options.renderCell) {
        throw new Error("CanopyX: renderCell was replaced by renderers, an object of functions (node, element, context) by column id.");
      }
      // A host draws only the columns it names; every other column keeps the default painter and its cell reuse.
      const renderers = options.renderers || {};
      if (typeof renderers !== "object" || (Object.getPrototypeOf(renderers) !== Object.prototype && Object.getPrototypeOf(renderers) !== null)) {
        throw new Error("CanopyX: renderers must be a plain object of functions by column id.");
      }
      Object.keys(renderers).forEach((id) => {
        if (typeof renderers[id] !== "function" || !view.columns.some((column) => column.id === id)) {
          throw new Error("CanopyX: renderers needs a function for a column of the view, not for '" + id + "'.");
        }
      });
      if (!options.formatLink !== !options.parseLink) {
        throw new Error("CanopyX: formatLink and parseLink define one link scheme and are given together.");
      }
      const rendererOf = (id) => (Object.prototype.hasOwnProperty.call(renderers, id) ? renderers[id] : null);
      this.columns = view.columns.map((column, index) => Object.assign({}, column, { hidden: index > 0 && !!column.hidden, render: rendererOf(column.id) }));
      this.keyMap = new Map();
      this.root = { key: null, h: null, parent: null, level: 0, idx: 0, expanded: true, children: null, total: null, next: null, loading: false, error: null };
      if (!options.source && (!view.source || view.source.kind === "inline")) {
        this.root.inlineItems = view.roots || [];
      }
      this.rows = [];
      this.tops = [0];
      this.total = 0;
      this.version = 1;
      this.rendered = new Map();
      this.pool = [];
      this.focused = null;
      this.selected = new Set();
      this.anchor = null;
      this.filter = null;
      this.filterExpand = false;
      this.activeFilters = new Set();
      this.sortState = null;
      this.typeBuf = "";
      this.typeAt = 0;
      this.rafId = 0;
      this.iconTemplates = this.buildIcons(view.icons || {});
      this.initializing = true;
      this.build();
      this.buildToolbar();
      this.ready = this.init();
    }

    async search(query, limit) {
      return validateSearchResult(await this.source.search(query, limit));
    }

    buildIcons(icons) {
      const templates = new Map();
      Object.keys(icons).forEach((key) => {
        const holder = h("span", "cx-icon");
        holder.setAttribute("aria-hidden", "true");
        holder.innerHTML = icons[key]; // trusted host SVG, declared once per view
        templates.set(key, holder);
      });
      return templates;
    }

    async init() {
      try {
        this.rootsReady = this.loadRoots();
        await this.rootsReady;
        await this.restoreState();
        // A stored expansion set takes precedence over declarative defaults. Neither restoration nor a partial
        // walk of slow defaults may write session state; user clicks made meanwhile are replayed at completion.
        await this.expandInitial(this.root);
        await this.openDeepLink();
      } finally {
        this.initializing = false;
      }
      if (this.destroyed) return;
      await this.flushPendingToggles();
      // A fragment that changed while the view was loading is opened now.
      if (this.linkChanged) await this.openDeepLink();
      if (!this.destroyed) {
        this.host.setAttribute("data-cx-ready", "true");
        this.emit("ready", {});
      }
    }

    /** Shows the first page of top-level nodes: synchronously for inline data, from the source otherwise. */
    loadRoots() {
      if (!this.root.inlineItems) {
        return this.loadPage(this.root, null);
      }
      validateNodes(this.root.inlineItems, this.keyMap, true);
      const first = slicePage(this.root.inlineItems, null, this.pageSize);
      this.root.inline = true;
      this.root.children = first.items.map((node, i) => this.wrap(node, this.root, i));
      this.root.total = first.total;
      this.root.next = first.next;
      this.applySort(this.root, false);
      this.relayout();
      return Promise.resolve();
    }

    expandable(w) {
      return !!(w && w.h && !w.h.detail && (w.h.hasChildren || (w.children && w.children.length)));
    }

    statusRow(parent, kind) {
      kind = parent.loading ? "loading" : parent.error ? "error" : kind;
      let row = parent._status;
      if (!row) {
        row = parent._status = { key: null, status: kind, parent: parent, level: parent.level + 1, hpx: this.rowH, h: { id: "", label: "" }, _v: 0 };
      }
      row.status = kind;
      const format = numberFormat(this.lang);
      const loaded = format.format(parent.children ? parent.children.length : 0);
      const labels = this.labels;
      row.h.label = kind === "loading" ? labels.loading : kind === "error" ? fill(labels.loadError, { error: parent.error }) :
        parent.total != null ? fill(labels.showMore, { loaded: loaded, total: format.format(parent.total) }) : fill(labels.showMoreUnknownTotal, { loaded: loaded });
      row._v = 0;
      return row;
    }

    /** The cell for a column; the tree column falls back to the label. */
    cellOf(node, column, index) {
      const cells = node.cells;
      if (cells && Object.prototype.hasOwnProperty.call(cells, column.id)) {
        return cells[column.id];
      }
      return index === 0 ? node.label : undefined;
    }

    emit(name, detail) {
      if (this.destroyed) return;
      this.host.dispatchEvent(new CustomEvent("canopyx:" + name, { detail: detail, bubbles: true }));
    }
  }
