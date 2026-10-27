  // ---------- resource timeline: resources, the tree beside the lanes, and the view's place in the calendar ----------
  // Resources are an ordinary CanopyX tree (the calendar's resources.view): its rows, expand and collapse, lazy children,
  // sorting, filters and columns are the tree's own. The tree sits on the left with its toolbar off; the lanes on the right
  // scroll both ways and drive the tree's vertical scroll, so a resource and its lane always share a row. Every time the
  // tree renders (scrolling, expanding, sorting, loading children) the lanes repaint the rows it shows.
  Object.assign(DataGrid.prototype, {
    startTimeline() {
      if (this.tl) return;
      const resources = this.cal.resources;
      this.tl = { names: new Map(), parent: new Map(), children: new Map(), order: [], learned: new Set(), stats: null, heat: new Map() };
      // Without resources the timeline's rows are its events packed by overlap, and there is no resource pane.
      this.tlSolo = !resources;
      if (this.tlSolo) { this.tlInline = true; return; }
      const inline = !resources.view.source || resources.view.source.kind === "inline";
      if (inline) this.tlLearnNodes(resources.view.roots || [], null);
      this.tlInline = inline;
    },
    /** Records names, parents and children of resource nodes (every node of an inline tree, the loaded ones of a lazy tree). */
    tlLearnNodes(nodes, parent) {
      const stack = nodes.map(node => [node, parent]).reverse();
      while (stack.length) {
        const [node, owner] = stack.pop();
        if (!node || typeof node.id !== "string" || this.tl.learned.has(node.id)) continue;
        this.tl.learned.add(node.id); this.tl.names.set(node.id, node.label ?? node.id); this.tl.parent.set(node.id, owner); this.tl.order.push(node.id);
        if (owner !== null) { if (!this.tl.children.has(owner)) this.tl.children.set(owner, []); this.tl.children.get(owner).push(node.id); }
        if (Array.isArray(node.children)) for (let i = node.children.length - 1; i >= 0; i--) stack.push([node.children[i], node.id]);
      }
    },
    calResourceName(id) { return this.tl?.names.get(id) ?? id; },
    /** Resource columns for day and week views: the leaf resources with a virtual column window for large schedules, grouped by their parent. */
    calResourceColumns() {
      if (!this.tl || !this.tlInline) return null;
      const leaves = this.tl.order.filter(id => !this.tl.children.has(id));
      if (!leaves.length) return null;
      return leaves.map(id => ({ id, label: this.calResourceName(id), group: this.tl.parent.get(id) == null ? null : this.calResourceName(this.tl.parent.get(id)) }));
    },
    /** Business hours of a resource on a weekday, from availability (its own entries, else the entries for every resource). */
    calHoursFor(resource, dow) {
      const list = this.cal.availability;
      if (!list.length) return undefined;
      let own = resource == null ? [] : list.filter(item => item.resource === resource);
      for (let parent = this.tl?.parent.get(resource); !own.length && parent != null; parent = this.tl.parent.get(parent)) own = list.filter(item => item.resource === parent);
      const entries = own.length ? own : list.filter(item => item.resource == null);
      return entries.length ? entries.filter(item => item.days.has(dow)) : undefined;
    },
    /** The resource before (-1) or after (1) another, in the tree's visible order, for the keyboard move mode. */
    calResourceStep(resource, sign) {
      if (this.tlSolo) return resource;
      const rows = this.tlTree ? this.tlTree.rows.filter(row => !row.status && !this.tl.children.has(row.key)).map(row => row.key) : this.tl.order.filter(id => !this.tl.children.has(id));
      const at = rows.indexOf(resource);
      return rows[Math.max(0, Math.min(rows.length - 1, (at < 0 ? 0 : at) + sign))] ?? resource;
    },
    /** Visible resources and their known descendants, bounded to the hosted request's 1,000 identities. */
    calResourceWindow() {
      if (this.cal.resourceIds || this.calView !== "timeline" || this.tlSolo || this.view.source.kind === "inline" && !this.opts.source) return null;
      // The first load comes before the first paint: the tree is built now, so even that load names only the resources in view,
      // and before the lanes have a height the rows of a tall screen stand in for the visible ones.
      this.tlEnsure();
      if (!this.tlTree?.rows?.length) return null;
      const range = this.tlMain.clientHeight ? this.tlVisibleRows(40) : { first: 0, last: Math.min(this.tlTree.rows.length - 1, 80) }, ids = new Set();
      for (let i = range.first; i <= range.last && ids.size < 1000; i++) {
        const row = this.tlTree.rows[i];
        if (!row || row.status) continue;
        const stack = [row.key];
        while (stack.length && ids.size < 1000) {
          const id = stack.pop();
          if (ids.has(id)) continue;
          ids.add(id);
          const children = this.tl.children.get(id) || [];
          for (let at = children.length - 1; at >= 0; at--) stack.push(children[at]);
        }
      }
      const window = [...ids];
      return window.length ? window : null;
    },
    /** A hosted timeline loads again when the resources in view change (scrolling, opening a group), not for every frame. */
    tlCheckWindow() {
      if (this.view.source.kind === "inline" && !this.opts.source) return;
      clearTimeout(this.tlWindowTimer);
      this.tlWindowTimer = setTimeout(() => {
        if (this.destroyed || this.calView !== "timeline") return;
        // Only resources the last load did not name need a new one.
        const wanted = this.calResourceWindow(), loaded = JSON.parse(this.calWindowKey || "null"), known = new Set(loaded || []);
        if (wanted && (!loaded || wanted.some(id => !known.has(id)))) this.calReload({ keep: true });
      }, 250);
    },
    /** Resolves once a hosted timeline's resource tree has its first rows (at once for other views and inline grids). */
    calResourcesReady() {
      if (this.calView !== "timeline" || this.view.source.kind === "inline" && !this.opts.source) return null;
      this.tlEnsure();
      return this.tlTree.ready?.catch(() => { });
    },

    calTimelineRange(date) { return this.cal.span ? tlCustomSpan(this.cal.span, date, this.cal.firstDay) : tlSpan(this.calZoom, date, this.cal.firstDay); },
    calTimelineStep(date, direction) { return this.cal.span ? tlCustomStep(this.cal.span, date, direction) : tlStep(this.calZoom, date, direction); },
    calTimelineTitle() {
      const range = this.calRange, fmt = this.calFmt;
      if (this.cal.span) return range.firstDay === range.lastDay ? fmt.longDay(range.firstDay) : fmt.dayRange(range.firstDay, range.lastDay);
      if (this.calZoom === "hour") return fmt.longDay(range.firstDay);
      if (this.calZoom === "day") return fmt.monthTitle(range.firstDay);
      if (this.calZoom === "week") return fmt.monthRange(range.firstDay, range.lastDay);
      return range.lastDay - range.firstDay > 400 ? fmt.year(range.firstDay) + " – " + fmt.year(range.lastDay) : fmt.year(range.firstDay);
    },
    calTimelineHasNow() { const now = Date.now(); return this.tlAxis ? now >= this.tlAxis.from && now < this.tlAxis.to : false; },

    /** Builds the timeline once: the tree host on the left, the time header and lanes on the right. */
    tlEnsure() {
      if (this.tlRoot) return;
      const resources = this.cal.resources, root = this.tlRoot = h("div", "cx-tl" + (this.tlSolo ? " cx-tl-solo" : "")), side = h("div", "cx-tl-side"), host = this.tlTreeHost = h("div", "cx-tl-tree");
      const main = this.tlMain = h("div", "cx-tl-main"), head = this.tlHead = h("div", "cx-tl-head"), canvas = this.tlCanvas = h("div", "cx-tl-canvas");
      head.setAttribute("aria-hidden", "true");
      const upper = this.tlUpper = h("div", "cx-tl-hrow cx-tl-upper"), lower = this.tlLower = h("div", "cx-tl-hrow cx-tl-lower");
      head.append(upper, lower);
      canvas.setAttribute("role", "grid"); canvas.setAttribute("aria-labelledby", this.calTitle.id); canvas.setAttribute("aria-readonly", String(!this.cal.editable));
      if (this.tlSolo) {
        // The rows are lanes of packed events, kept in a small stand-in for the tree (tlIndexEvents fills it).
        root.append(main); main.append(head, canvas);
        const signal = this.lifetime.signal;
        this.tlTree = { rows: [], tops: [0], rowH: this.rowH || 34, version: 0, destroyed: false, ready: Promise.resolve(), grid: side,
          scheduleRender: () => this.tlScheduleLanes(), setState: () => Promise.resolve(), destroy() { this.destroyed = true; } };
        main.addEventListener("scroll", () => this.tlScheduleLanes(), { passive: true, signal });
        return;
      }
      root.style.setProperty("--cx-tl-side", resources.width + "px");
      main.append(head, canvas); side.appendChild(host); root.append(side, main);
      const aggregates = resources.aggregates, renderers = {};
      for (const [column, kind] of Object.entries(aggregates)) renderers[column] = (node, element) => { setText(element, this.tlAggregateText(node.id, kind)); element.classList.add("cx-tl-agg"); return true; };
      const view = { ...resources.view, rowHeight: this.view.plan ? Math.max(64, resources.view.rowHeight || this.rowH) : resources.view.rowHeight || this.rowH, labels: { ...this.view.labels, ...resources.view.labels } };
      const tree = this.tlTree = new TreeGrid(host, { view, toolbar: false, renderers, labels: this.opts.labels });
      // The resource tree's events stay inside the calendar: the grid host has its own events of the same names.
      tree.emit = (name, detail) => { if (!tree.destroyed) host.dispatchEvent(new CustomEvent("canopyx:" + name, { detail })); };
      const render = tree.render.bind(tree);
      tree.render = () => { const result = render(); if (!this.tlRows || this.tlRows !== tree.rows.length + ":" + tree.version) { this.tlLearnLoaded(); } this.tlPaintLanes(); this.tlCheckWindow(); return result; };
      const signal = this.lifetime.signal;
      let syncing = false;
      main.addEventListener("scroll", () => {
        if (!syncing && tree.grid.scrollTop !== main.scrollTop) { syncing = true; tree.grid.scrollTop = main.scrollTop; syncing = false; }
        this.tlScheduleLanes();
        this.tlCheckWindow();
      }, { passive: true, signal });
      tree.grid.addEventListener("scroll", () => { if (!syncing && Math.abs(tree.grid.scrollTop - main.scrollTop) > 1) { syncing = true; main.scrollTop = tree.grid.scrollTop; syncing = false; } }, { passive: true, signal });
      host.addEventListener("wheel", event => {
        if (!event.deltaY || event.ctrlKey) return;
        event.preventDefault();
        main.scrollTop += event.deltaY * (event.deltaMode === 1 ? tree.rowH : event.deltaMode === 2 ? main.clientHeight : 1);
      }, { passive: false, signal });
      host.addEventListener("canopyx:toggle", event => {
        const node = event.detail.node;
        if (event.detail.expanded) this.calCollapsed.delete(node.id); else this.calCollapsed.add(node.id);
        this.stateChanged();
      }, { signal });
      host.addEventListener("canopyx:select", event => {
        const node = event.detail.node;
        if (!node) { this.clearCalendarSelection(); return; }
        const zone = this.calZone, range = this.calRange, ids = new Set([node.id, ...this.tlDescendants(node.id)]);
        this.calSelection = { first: range.firstDay, last: range.lastDay, from: zone.start(range.firstDay), to: zone.start(range.lastDay + 1), resource: node.id };
        const events = this.calEvents.filter(item => !item.background && this.calEventResources(item).some(id => ids.has(id)));
        this.calAnnounce(fill(this.calLabels.calendarSelected, { range: this.calResourceName(node.id) }));
        this.calEmitLink("select", events, this.calResourceName(node.id), this.calSelection);
      }, { signal });
      signal.addEventListener("abort", () => { clearTimeout(this.tlWindowTimer); tree.destroy(); }, { once: true });
      tree.ready.then(() => { if (!this.destroyed) { this.calApplyCollapsed(); this.tlPaintLanes(); } }, error => this.emit("error", { error }));
    },
    /** Learns resource nodes a lazy tree loaded since the last render. */
    tlLearnLoaded() {
      const tree = this.tlTree;
      this.tlRows = tree.rows.length + ":" + tree.version;
      for (const row of tree.rows) if (!row.status && row.key != null && !this.tl.learned.has(row.key)) {
        this.tl.learned.add(row.key); this.tl.names.set(row.key, row.h.label ?? row.key); this.tl.order.push(row.key);
        const parent = row.parent?.key ?? null; this.tl.parent.set(row.key, parent);
        if (parent !== null) { if (!this.tl.children.has(parent)) this.tl.children.set(parent, []); this.tl.children.get(parent).push(row.key); }
        if (row.h.hasChildren && !this.tl.children.has(row.key)) this.tl.children.set(row.key, []);
      }
    },
    tlDescendants(id) {
      const out = [], stack = [...(this.tl.children.get(id) || [])];
      while (stack.length && out.length < 100000) { const next = stack.pop(); out.push(next); stack.push(...(this.tl.children.get(next) || [])); }
      return out;
    },
    /** Collapses the resources a saved state names and opens the others (inline trees know every group). */
    calApplyCollapsed() {
      const tree = this.tlTree;
      if (!tree || this.destroyed) return;
      const expanded = [];
      if (this.tlInline) {
        const walk = (id, path) => { if (!this.tl.children.has(id) || this.calCollapsed.has(id)) return; expanded.push(path); for (const child of this.tl.children.get(id)) walk(child, path.concat(child)); };
        for (const id of this.tl.order) if (this.tl.parent.get(id) === null) walk(id, [id]);
        tree.setState({ expanded }).catch?.(() => {});
      }
    },

    calPaintTimeline() {
      this.tlEnsure();
      if (this.tlRoot.parentNode !== this.calBody) this.calBody.replaceChildren(this.tlRoot);
      const span = this.calRange, axis = this.tlAxis = tlAxis(this.calZoom, span, this.calZone, this.cal.firstDay, this.view.plan ? this.tlMain.clientWidth : 0);
      if(this.view.plan)this.planFitWidth=this.tlMain.clientWidth;
      this.tlIndex = this.tlIndexEvents();
      this.tl.heat.clear();
      if (this.tlRoot.parentNode !== this.calBody) this.calBody.replaceChildren(this.tlRoot);
      this.tlCanvas.style.width = axis.total + "px"; this.tlHead.style.width = axis.total + "px";
      // The larger periods keep their names in view while the axis scrolls under them (a sticky label inside each cell).
      const header = tlHeader(this, axis), paint = (row, cells, cls) => {
        row.replaceChildren(...cells.map(cell => { const element = h("div", cls + (cell.weekend ? " cx-tl-weekend" : "")), text = h("span", "cx-tl-hlabel"); element.style.insetInlineStart = cell.x + "px"; element.style.width = cell.width + "px"; setText(text, cell.text); element.appendChild(text); element.title = cell.label; return element; }));
      };
      paint(this.tlUpper, header.upper, "cx-tl-hcell cx-tl-hupper"); paint(this.tlLower, header.lower, "cx-tl-hcell");
      this.tlHeader = header;
      this.calGrid = this.tlCanvas;
      if (this.tlScrolledFor !== this.calZoom + ":" + span.firstDay) {
        this.tlScrolledFor = this.calZoom + ":" + span.firstDay;
        const now = Date.now(), target = now >= axis.from && now < axis.to ? axis.x(now) - this.tlMain.clientWidth / 3 : 0;
        this.tlScrollTo(Math.max(0, target));
      }
      this.tlTree.version++; this.tlTree.scheduleRender();
      this.tlPaintLanes();
    },
    /** The axis position at the scroller's start edge, and scrolling to one (right to left scrolls with negative positions). */
    tlScrollX() { return Math.abs(this.tlMain.scrollLeft); },
    tlScrollTo(x) { this.tlMain.scrollLeft = this.calRtl ? -x : x; },
    calTimelineScroll() { return this.tlMain ? { timeline: true, top: this.tlMain.scrollTop, left: this.tlScrollX(), view: "timeline", date: this.calDate, zoom: this.calZoom } : null; },
    calRestoreTimelineScroll(state) {
      if (state.zoom !== this.calZoom || state.date !== this.calDate) return false;
      this.tlMain.scrollTop = state.top; this.tlScrollTo(state.left);
      return true;
    }
  });
