
  // ---------- tree grid: model ----------
  // Loaded nodes keep their children. The visible rows are a flat array rebuilt on every structure change, in time
  // proportional to the visible rows. Rows have a fixed height; a detail row spans several row slots.
  class TreeGrid {
    constructor(host, options) {
      const view = checkDocument(options.view, "view");
      this.host = host;
      this.view = view;
      this.opts = options;
      this.id = "cx" + ++instanceSeq;
      this.source = options.source || sourceFor(view);
      this.rowH = view.rowHeight || 28;
      this.pageSize = view.pageSize || 100;
      this.multi = view.selection === "multiple";
      this.lang = document.documentElement.lang || undefined;
      this.columns = view.columns.map((column, index) => Object.assign({}, column, { hidden: index > 0 && !!column.hidden }));
      this.keyMap = new Map();
      this.root = { key: null, h: null, parent: null, level: 0, idx: 0, expanded: true, children: null, total: null, next: null, loading: false, error: null, span: 1 };
      if (!view.source || view.source.kind === "inline") {
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
      this.build();
      this.buildToolbar();
      this.ready = this.init();
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
        await this.expandInitial(this.root);
        await this.restoreState();
        await this.openDeepLink();
      } finally {
        if (!this.destroyed) {
          this.host.setAttribute("data-cx-ready", "true");
          this.emit("ready", {});
        }
      }
    }

    /** Shows the first page of top-level nodes: synchronously for inline data, from the source otherwise. */
    loadRoots() {
      if (!this.root.inlineItems) {
        return this.loadPage(this.root, null);
      }
      const first = slicePage(this.root.inlineItems, null, this.pageSize);
      this.root.inline = true;
      this.root.children = first.items.map((node, i) => this.wrap(node, this.root, i));
      this.root.total = first.total;
      this.root.next = first.next;
      this.applySort(this.root, false);
      this.relayout();
      return Promise.resolve();
    }

    /** Loads lazy children of nodes that start expanded. */
    async expandInitial(parent) {
      if (this.destroyed) return;
      for (const w of parent.children || []) {
        if (w.autoExpand && !w.children) {
          w.autoExpand = false;
          await this.toggle(w, true);
        }
        if (w.expanded && w.children) {
          await this.expandInitial(w);
        }
      }
    }

    wrap(node, parent, index) {
      const w = {
        key: node.id, h: node, parent: parent, level: parent.level + 1, idx: index, expanded: false,
        children: null, total: null, next: null, inline: false, loading: false, error: null,
        span: node.detail ? Math.max(1, node.detail.height || 1) : 1, _v: 0
      };
      this.keyMap.set(node.id, w);
      if (Array.isArray(node.children)) {
        const first = slicePage(node.children, null, this.pageSize);
        w.inline = true;
        w.children = first.items.map((child, i) => this.wrap(child, w, i));
        w.total = first.total;
        w.next = first.next;
        w.expanded = !!node.expanded;
        this.applySort(w, false);
      } else if (node.hasChildren) {
        w.total = typeof node.childCount === "number" ? node.childCount : null;
        w.autoExpand = !!node.expanded;
      }
      return w;
    }

    expandable(w) {
      return !!(w && w.h && !w.h.detail && (w.h.hasChildren || (w.children && w.children.length)));
    }

    /** 2 = the node matches (its subtree shows), 1 = kept as an ancestor of matches, 0 = hidden. */
    matchState(w) {
      if (w._fm !== undefined) {
        return w._fm;
      }
      let state = this.filter.match(w.h) ? 2 : 0;
      if (!state && this.filter.keep && this.filter.keep(w.h)) {
        state = 1;
      }
      if (!state && w.children) {
        for (const child of w.children) {
          if (this.matchState(child) > 0) {
            state = 1;
            break;
          }
        }
      }
      w._fm = state;
      return state;
    }

    relayout() {
      if (this.destroyed) return;
      const rows = [];
      const filter = this.filter;
      if (filter) {
        this.keyMap.forEach((w) => { w._fm = undefined; });
      }
      const walk = (parent, filtered) => {
        let pos = 0;
        for (const w of parent.children || []) {
          let filterChildren = false;
          if (filtered) {
            const state = this.matchState(w);
            if (!state) {
              continue;
            }
            filterChildren = state === 1;
          }
          w.pos = ++pos;
          rows.push(w);
          // A node opens when the user expanded it (its first page may still be loading or have failed) or when a
          // filter reveals loaded matches below it, unless the user collapsed it while that filter was on.
          const autoOpen = filterChildren && this.filterExpand && !w.filterCollapsed && w.children && w.children.length;
          w._open = !!((w.expanded && (w.children || w.loading || w.error)) || autoOpen);
          if (w._open) {
            walk(w, filterChildren);
          }
        }
        parent.visibleCount = pos;
        // "Show more" stays under filtered branches too: matches on pages not loaded yet must stay reachable.
        if (parent.loading) {
          rows.push(this.statusRow(parent, "loading"));
        } else if (parent.error) {
          rows.push(this.statusRow(parent, "error"));
        } else if (parent.next) {
          rows.push(this.statusRow(parent, "more"));
        }
      };
      walk(this.root, !!filter);
      this.rows = rows;
      const tops = new Array(rows.length + 1);
      let y = 0;
      for (let i = 0; i < rows.length; i++) {
        rows[i]._ri = i;
        tops[i] = y;
        y += rows[i].span * this.rowH;
      }
      tops[rows.length] = y;
      this.tops = tops;
      this.total = y;
      this.canvas.style.height = y + "px";
      this.grid.setAttribute("aria-rowcount", String(rows.length + 1));
      if (this.focused && this.indexOf(this.focused) < 0) {
        this.focused = null;
      }
      this.scheduleRender();
    }

    statusRow(parent, kind) {
      let row = parent["_" + kind];
      if (!row) {
        row = parent["_" + kind] = { key: null, status: kind, parent: parent, level: parent.level + 1, span: 1, h: { id: "", label: "" }, _v: 0 };
      }
      const loaded = parent.children ? parent.children.length : 0;
      const format = numberFormat(this.lang);
      row.h.label = kind === "loading" ? "Loading…" : kind === "error" ? "Could not load: " + parent.error + " (Enter to retry)" :
        parent.total != null ? "Show more (" + format.format(loaded) + " of " + format.format(parent.total) + " loaded)" : "Show more (" + format.format(loaded) + " loaded)";
      row._v = 0;
      return row;
    }

    applySort(parent, deep) {
      const children = parent.children;
      if (!children) {
        return;
      }
      const state = this.sortState;
      const column = state && this.columns.find((c) => c.id === state.column);
      if (column) {
        const direction = state.direction === "desc" ? -1 : 1;
        const index = this.columns.indexOf(column);
        const keys = new Map();
        const keyOf = (w) => {
          let key = keys.get(w);
          if (!key) {
            key = sortKey(this.cellOf(w.h, column, index), column);
            keys.set(w, key);
          }
          return key;
        };
        children.sort((a, b) => compareKeys(keyOf(a), keyOf(b), direction) || a.idx - b.idx);
      } else {
        children.sort((a, b) => a.idx - b.idx);
      }
      if (deep) {
        for (const child of children) {
          this.applySort(child, true);
        }
      }
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
