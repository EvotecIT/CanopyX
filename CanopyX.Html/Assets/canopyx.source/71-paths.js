
  // ---------- tree grid: opening a path (search hits, deep links, remembered state, expandPath) ----------
  // A path opens level by level in the model, but the rows are rebuilt and rendered once, when it is open: the levels
  // in between are never laid out, and focus moves once, at the end. Before that, the source may load the pages the path
  // will read all at once (prefetch; a bundle's search index says where they are).
  Object.assign(TreeGrid.prototype, {
    /** Opens a node for expandPath and throws when its children cannot be loaded. */
    async openForPath(w) {
      if (this.destroyed || w._invalidated) return false;
      const wasOpen = w.expanded && !w.filterCollapsed;
      w.expanded = true;
      w.filterCollapsed = false;
      if (!wasOpen) this.relayout();
      const revision = w.toggleRevision || 0;
      if (!w.children) {
        await this.loadPage(w, null);
        if (this.destroyed || w._invalidated || !w.expanded || (w.toggleRevision || 0) !== revision) return false;
        if (!w.children) {
          throw new Error("CanopyX: could not load the children of '" + w.key + "': " + (w.error || "no data"));
        }
      } else if (!wasOpen) {
        await this.expandInitial(w);
      }
      return !this.destroyed && !w._invalidated && w.expanded && (w.toggleRevision || 0) === revision;
    },

    /**
     * Expands the tree along an id path, paging through "show more" until each id is loaded. Options: select and
     * focus (default true), reveal (scroll to the node, default true), expandLast (also open the last node),
     * signal (AbortSignal; cancelled navigation returns null without selecting or focusing).
     */
    async expandPath(ids, options) {
      const o = options || {};
      const cancelled = () => this.destroyed || !!(o.signal && o.signal.aborted);
      if (cancelled()) return null;
      await this.rootsReady;
      if (cancelled()) return null;
      // A newer navigation does not wait for the files an older one asked for.
      const aborted = o.signal ? new Promise((resolve) => o.signal.addEventListener("abort", resolve, { once: true })) : null;
      await (aborted ? Promise.race([this.prefetchPath(ids, !!o.expandLast), aborted]) : this.prefetchPath(ids, !!o.expandLast));
      if (cancelled()) return null;
      const release = this.holdLayout();
      let w;
      let rebuilt = false;
      try {
        w = await this.openPath(ids, o, cancelled);
      } finally {
        // One row rebuild for every level the path opened.
        rebuilt = release();
      }
      if (w === undefined) return null;
      // Another path can still hold the rows; this one reads them to reveal and focus its node.
      if (w && (o.focus !== false || o.reveal !== false) && this.flushLayout()) rebuilt = true;
      // Opening levels puts new rows around the node: the frame that shows it first draws only what is in view.
      if (w && rebuilt && (o.focus !== false || o.reveal !== false)) this.leanReveal();
      if (w && o.reveal !== false && this.filter && this.indexOf(w) < 0) {
        this.clearDeclaredFilters();
        this.setFilter(null);
        this.flushLayout();
      }
      this.stateChanged();
      if (w && o.select !== false) {
        this.select(w);
      }
      if (w && o.focus !== false) {
        this.setFocus(w, true);
      } else if (w && o.reveal !== false) {
        this.ensureVisible(w);
      }
      return w ? w.h : null;
    },

    /**
     * Lets the source load at once the pages a path will read, instead of one level after another: the children of
     * the nodes that open and are not loaded yet, and the lists that do not hold their node on a loaded page yet.
     */
    async prefetchPath(ids, openLast) {
      if (typeof this.source.prefetch !== "function") return;
      const opens = [];
      const finds = [];
      let parent = this.root;
      ids.forEach((id, k) => {
        if (k > 0 && !(parent && parent.children)) opens.push(ids[k - 1]);
        const w = this.keyMap.get(id);
        if (!(w && parent && w.parent === parent)) finds.push(id);
        parent = w && w.parent === parent ? w : null;
      });
      if (openLast && ids.length && !(parent && parent.children)) opens.push(ids[ids.length - 1]);
      if (!opens.length && !finds.length) return;
      try {
        await this.source.prefetch(opens, finds);
      } catch (err) {
        // Prefetching only saves time; opening the path reads and reports what failed.
      }
    },

    /** Opens the nodes of a path in the model; returns the last node, or undefined when the path was abandoned. */
    async openPath(ids, o, cancelled) {
      let parent = this.root;
      let w = null;
      const opened = [];
      for (let k = 0; k < ids.length; k++) {
        if (parent !== this.root) {
          try { if (!await this.openForPath(parent)) return undefined; }
          catch (err) { if (cancelled() || parent._invalidated) return undefined; throw err; }
          opened.push([parent, parent.toggleRevision || 0]);
        }
        if (cancelled() || parent._invalidated || (parent !== this.root && !parent.expanded)) return undefined;
        w = this.keyMap.get(ids[k]);
        const seenCursors = new Set();
        while ((!w || w.parent !== parent) && parent.children && parent.next) {
          const before = parent.children.length;
          const cursor = parent.next;
          if (seenCursors.has(cursor)) {
            throw new Error("CanopyX: could not load more children of '" + (parent.key || "the top level") + "': no progress (continuation repeated)");
          }
          seenCursors.add(cursor);
          await this.loadPage(parent, parent.next);
          if (cancelled() || parent._invalidated || (parent !== this.root && (!parent.expanded || (parent.toggleRevision || 0) !== opened[opened.length - 1][1]))) return undefined;
          if (parent.error || (parent.children.length === before && parent.next === cursor)) {
            throw new Error("CanopyX: could not load more children of '" + (parent.key || "the top level") + "': " + (parent.error || "no progress"));
          }
          w = this.keyMap.get(ids[k]);
        }
        if (!w || w.parent !== parent) {
          throw new Error("CanopyX: id not found on the path: " + ids[k]);
        }
        parent = w;
      }
      if (o.expandLast && w && this.expandable(w)) {
        try { if (!await this.openForPath(w)) return undefined; }
        catch (err) { if (cancelled() || w._invalidated) return undefined; throw err; }
        opened.push([w, w.toggleRevision || 0]);
      }
      if (cancelled() || (w && w._invalidated) || opened.some(([node, revision]) =>
        node._invalidated || !node.expanded || (node.toggleRevision || 0) !== revision)) return undefined;
      return w;
    }
  });
