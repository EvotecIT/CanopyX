
  // ---------- tree grid: model ----------
  // Loaded nodes keep their children. The visible rows are a flat array rebuilt on every structure change, in time
  // proportional to the visible rows. Rows have a fixed height; a detail row spans several row slots, or is as tall
  // as its content when it declares no height.
  class TreeGrid {
    constructor(host, options) {
      const view = checkDocument(options.view, "view");
      requireIdentifier(view.id, "view ID");
      if (view.columns.some(column => column.format !== undefined)) throw new Error("CanopyX: number formats apply to flat grids only.");
      this.host = host;
      this.view = view;
      this.opts = options;
      for (const name of ["isSelectable", "beforeSelect", "sanitizeHtml"]) {
        if (options[name] !== undefined && typeof options[name] !== "function") throw new Error("CanopyX: " + name + " must be a function.");
      }
      do { this.id = "cx" + ++instanceSeq; } while (document.getElementById(this.id));
      this.lifetime = new AbortController();
      this.source = options.source || sourceFor(view, { signal: this.lifetime.signal, timeoutMs: options.requestTimeoutMs });
      this.queryAware = this.source.queryAware === true;
      this.dataLifetime = new AbortController();
      this.acceptedQuery = Object.freeze({ version: 1, sort: null, filters: Object.freeze([]) });
      this.datasetRevision = null;
      this.rowH = view.rowHeight || 40;
      this.pageSize = view.pageSize || 100;
      this.retainedNodeLimit = options.retainedNodeLimit === undefined ? 1024 : options.retainedNodeLimit;
      if (!validStructuralCount(this.retainedNodeLimit)) throw new Error("CanopyX: retainedNodeLimit must be a nonnegative 32-bit integer.");
      this.inactiveNodeLimit = options.inactiveNodeLimit === undefined ? 4096 : options.inactiveNodeLimit;
      if (!validStructuralCount(this.inactiveNodeLimit)) throw new Error("CanopyX: inactiveNodeLimit must be a nonnegative 32-bit integer.");
      this.multi = view.selection === "multiple";
      this.lang = document.documentElement.lang || undefined;
      // Every text the grid writes itself: English, then the view's translations, then the host's.
      this.labels = labelsFor(view.labels, options.labels);
      // Per-control toolbar switches, as on flat grids: the view's toolbar object, then the host's; a missing switch keeps its control.
      this.tools = Object.assign({}, view.toolbar, options.toolbar);
      if (Object.entries(this.tools).some(([name, value]) => !/^(search|filters|columns|views|export|more|matches|layout)$/.test(name) || typeof value !== "boolean"))
        throw new Error("CanopyX: toolbar options are booleans by control name.");
      // Dates show in UTC unless the view, or the host at run time, asks for the reader's own time zone.
      this.local = view.timeZone === "local";
      this.fmt = formatting(this.lang, this.local, this.labels);
      // A host draws only the columns it names, a plugin the columns that name its renderer; every other column keeps the
      // default painter and its cell reuse.
      this.kind = "tree";
      this.plugins = viewPlugins(options, this.kind);
      const renderers = hostRenderers(options.renderers || {}, view.columns, this.plugins);
      if (!options.formatLink !== !options.parseLink) {
        throw new Error("CanopyX: formatLink and parseLink define one link scheme and are given together.");
      }
      this.columns = view.columns.map((column, index) => ({ ...column, hidden: index > 0 && !!column.hidden,
        render: Object.hasOwn(renderers, column.id) ? renderers[column.id] : null }));
      this.columns.forEach(prepareWidth);
      this.columns.forEach(validateColumnValues);
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
      // The predicate built from the view's active filters, which a host predicate can replace.
      this.declaredFilter = null;
      this.filterExpand = false;
      this.activeFilters = new Set();
      this.sortState = null;
      this.typeBuf = "";
      this.typeAt = 0;
      this.rafId = 0;
      this.iconTemplates = this.buildIcons(view.icons || {});
      this.initializing = true;
      this.prepareViewModes();
      this.build();
      this.buildToolbar();
      // The links part (86-links.js) loads beside the data; a failure is reported when the address is first read.
      if (view.deepLink) loadPart(LINKS).catch(() => {});
      // The declared view modes (87-view-modes.js) start with the tree tools part; ready waits for them too.
      this.ready = this.modesReady ? Promise.all([this.init(), this.modesReady]).then(([result]) => result) : this.init();
    }

    async search(query, limit) {
      if (this.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
      const navigation = navigationScope(this, this.dataLifetime.signal);
      try {
        const result = await navigation.wait(this.source.search(query, limit, this.sourceRequest(this.dataLifetime.signal)));
        if (navigation.cancelled()) throw new DOMException("Search snapshot was retired.", "AbortError");
        if (this.queryAware) snapshotRevision(result, this.datasetRevision);
        return validateSearchResult(result);
      } finally { navigation.dispose(); }
    }

    buildIcons(icons) {
      const templates = new Map();
      Object.keys(icons).forEach((key) => {
        const holder = h("span", "cx-icon");
        holder.setAttribute("aria-hidden", "true");
        hostHtml(holder, icons[key], this.opts.sanitizeHtml, "icon"); // trusted host SVG, declared once per view
        templates.set(key, holder);
      });
      return templates;
    }

    async init() {
      try {
        this.rootsReady = this.loadRoots();
        await this.rootsReady;
        // The tree tools part restores column order, user widths and the pin; a failed part leaves the plain tree.
        await this.toolsReady;
        await this.restoreState();
        // A stored expansion set takes precedence over declarative defaults. Neither restoration nor a partial
        // walk of slow defaults may write session state; user clicks made meanwhile are replayed at completion.
        await this.expandInitial(this.root);
        // A queued address belongs to the data lifetime in which its caller requested it.
        if (!this.linkChanged || !this.linkChanged.aborted) await this.openDeepLink();
      } finally {
        this.initializing = false;
      }
      if (this.destroyed) return;
      await this.flushPendingToggles();
      // A fragment that changed while the view was loading is opened now.
      if (this.linkChanged && !this.linkChanged.aborted) await this.openDeepLink();
      if (!this.destroyed) {
        this.host.setAttribute("data-cx-ready", "true");
        this.emit("ready", {});
        this.scheduleRender();
      }
    }

    /** Shows the first page of top-level nodes: synchronously for inline data, from the source otherwise. */
    loadRoots() {
      if (!this.root.inlineItems) {
        return this.loadPage(this.root, null);
      }
      validateNodes(this.root.inlineItems, this.keyMap, true);
      this.root.inline = true;
      const first = this.inlinePage(this.root, null);
      this.root.children = first.items.map((node, i) => this.wrap(node, this.root, first.positions[i]));
      this.root.total = first.total;
      this.root.next = first.next;
      this.applySort(this.root, false);
      this.relayout();
      return Promise.resolve();
    }

    expandable(w) {
      return !!(w && w.h && !w.h.detail && (w.h.hasChildren || (w.children && w.children.length) || (w.inline && w.h.children.length)));
    }

    statusRow(parent, kind) {
      kind = parent.loading ? "loading" : parent.error ? "error" : kind;
      let row = parent._status;
      if (!row) {
        row = parent._status = { key: null, status: kind, parent, level: parent.level + 1, hpx: this.rowH, h: { id: "", label: "" }, _v: 0 };
      }
      row.status = kind;
      const format = numberFormat(this.lang);
      const loaded = format.format(parent.children ? parent.children.length : 0);
      const labels = this.labels;
      row.h.label = kind === "loading" ? labels.loading : kind === "error" ? fill(labels.loadError, { error: parent.error }) :
        parent.total != null ? fill(labels.showMore, { loaded, total: format.format(parent.total) }) : fill(labels.showMoreUnknownTotal, { loaded });
      row._v = 0;
      return row;
    }

    /** The cell for a column; the tree column falls back to the label. */
    cellOf(node, column, index) {
      const cells = node.cells;
      if (cells && Object.hasOwn(cells, column.id)) {
        return cells[column.id];
      }
      return index === 0 ? node.label : undefined;
    }

    emit(name, detail) {
      if (this.destroyed) return;
      this.host.dispatchEvent(new CustomEvent("canopyx:" + name, { detail, bubbles: true }));
    }
  }
