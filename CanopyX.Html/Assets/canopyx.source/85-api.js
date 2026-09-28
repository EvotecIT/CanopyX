
  // ---------- tree grid: remembered state, deep links, outline, counts ----------
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  Object.assign(TreeGrid.prototype, {
    pathOf(w) {
      const path = [];
      for (let node = w; node && node !== this.root; node = node.parent) {
        path.push(node.key);
      }
      return path.reverse();
    },

    getExpandedPaths() {
      const out = [];
      const pending = (this.root.children || []).slice().reverse();
      while (pending.length) {
        const child = pending.pop();
        if (child.expanded && this.expandable(child)) {
          out.push(this.pathOf(child));
          if (child.children) {
            for (let i = child.children.length - 1; i >= 0; i--) pending.push(child.children[i]);
          }
        }
      }
      return out;
    },

    async setState(state) {
      if (this.destroyed || !state || !Array.isArray(state.expanded)) {
        return;
      }
      // Invalid or obsolete stored state must not clear current expansion or reject ready.
      try {
        for (const path of state.expanded) {
          if (!Array.isArray(path) || !path.length) return;
          for (const id of path) requireIdentifier(id, "remembered path ID");
        }
      } catch (error) {
        return;
      }
      if (this.restoreController) this.restoreController.abort();
      const current = this.restoreController = new AbortController();
      this.restoreGeneration = (this.restoreGeneration || 0) + 1;
      // Clicks queued for an older restoration cannot override this state.
      this.pendingRestorationToggles = null;
      this.restoring = true;
      clearTimeout(this.saveTimer);
      try {
        this.keyMap.forEach((w) => { w.expanded = false; w.autoExpand = false; });
        this.relayout();
        const paths = state.expanded.slice().sort((a, b) => a.length - b.length);
        for (const path of paths) {
          if (this.destroyed || current.signal.aborted) break;
          try {
            await this.expandPath(path, { select: false, focus: false, reveal: false, expandLast: true, signal: current.signal });
          } catch (e) {
            // A remembered node may no longer exist.
          }
        }
      } finally {
        if (this.restoreController === current) {
          this.restoring = false;
          this.restoreController = null;
          if (!this.initializing) await this.flushPendingToggles();
        }
      }
    },

    async flushPendingToggles() {
      if (this.pendingToggleFlush) {
        try { await this.pendingToggleFlush; }
        catch (error) { if (!this.restoreController) throw error; }
        if (this.restoring || this.initializing) return;
        return this.flushPendingToggles();
      }
      const pending = this.pendingRestorationToggles;
      if (!pending || !pending.size) return;
      const generation = this.restoreGeneration || 0;
      this.replayingToggles = true;
      const run = (async () => {
        let failure = null;
        while (!this.destroyed && generation === (this.restoreGeneration || 0) && pending.size) {
          const [node, expand] = pending.entries().next().value;
          pending.delete(node);
          try { await this.toggle(node, expand, true); }
          catch (error) { if (!failure) failure = error; }
        }
        if (failure && generation === (this.restoreGeneration || 0)) throw failure;
      })();
      this.pendingToggleFlush = run;
      try {
        await run;
      } finally {
        if (this.pendingToggleFlush === run) this.pendingToggleFlush = null;
        this.replayingToggles = false;
        if (this.pendingRestorationToggles === pending && !pending.size) {
          this.pendingRestorationToggles = null;
          if (!this.destroyed) this.stateChanged();
        }
      }
    },

    stateKey() {
      return this.view.stateKey == null ? null : "canopyx:" + this.view.stateKey;
    },

    stateChanged() {
      const key = this.stateKey();
      if (this.destroyed || !key || this.restoring || this.initializing || this.replayingToggles) {
        return;
      }
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        if (this.destroyed || this.restoring || this.initializing || this.replayingToggles) return;
        try {
          sessionStorage.setItem(key, JSON.stringify({ expanded: this.getExpandedPaths() }));
        } catch (e) {
          // Storage can be unavailable (private mode, blocked storage).
        }
      }, 250);
    },

    async restoreState() {
      const key = this.stateKey();
      if (!key) {
        return;
      }
      let state = null;
      try {
        state = JSON.parse(sessionStorage.getItem(key) || "null");
      } catch (e) {
        state = null;
      }
      await this.setState(state);
    },

    deepLinkName() {
      return "cx." + encodeURIComponent(this.view.id);
    },

    hashParams() {
      return (global.location.hash || "").replace(/^#/, "").split("&").filter(Boolean);
    },

    async openDeepLink() {
      if (!this.view.deepLink) {
        return;
      }
      const prefix = this.deepLinkName() + "=";
      const param = this.hashParams().find((p) => p.startsWith(prefix));
      if (!param) {
        return;
      }
      try {
        const ids = param.slice(prefix.length).split("/").filter(Boolean).map(decodeURIComponent);
        await this.expandPath(ids, { select: true, focus: false });
      } catch (e) {
        this.announce(e.message);
      }
    },

    writeDeepLink(w) {
      if (!this.view.deepLink) {
        return;
      }
      const prefix = this.deepLinkName() + "=";
      const params = this.hashParams().filter((p) => !p.startsWith(prefix));
      if (w) params.push(prefix + this.pathOf(w).map(encodeURIComponent).join("/"));
      const hash = "#" + params.join("&");
      try {
        global.history.replaceState(global.history.state, "", hash);
      } catch (e) {
        global.location.hash = hash;
      }
    },

    visibleRows() {
      return this.rows.filter((w) => !w.status).map((w) => ({ node: w.h, level: w.level, path: this.pathOf(w) }));
    },

    /** An indented outline table of the rows that are open, for print and hosts that export what the user sees. */
    toOutline() {
      const cols = this.visibleColumns();
      const out = ["<table class=\"cx-outline-table\"><thead><tr>"];
      cols.forEach((column) => out.push("<th>" + escapeHtml(column.title) + "</th>"));
      out.push("</tr></thead><tbody>");
      this.rows.forEach((w) => {
        if (w.status) {
          return;
        }
        const pad = " style=\"padding-left:" + ((w.level - 1) * 14 + 4) + "px\"";
        if (w.h.detail) {
          const detail = w.h.detail;
          const content = h("div");
          this.renderDetail(w.h, content, true);
          out.push("<tr><td" + pad + " colspan=\"" + cols.length + "\">" + content.innerHTML + "</td></tr>");
          return;
        }
        out.push("<tr>");
        cols.forEach((column, i) => {
          const index = this.columns.indexOf(column);
          const value = this.cellOf(w.h, column, index);
          const text = cellText(value, column, this.lang);
          const content = h("span");
          if (!this.opts.renderCell || this.opts.renderCell(w.h, column.id, content, { level: w.level, expanded: w.expanded, index }) !== true) {
            const badges = (i === 0 ? w.h.badges || [] : []).concat(isCellObject(value) ? value.badges || [] : []);
            content.appendChild(detailCell("span", Object.assign({}, isCellObject(value) ? value : {}, { text, badges }), this.lang));
          }
          out.push("<td" + (i === 0 ? pad : "") + ">" + content.outerHTML + "</td>");
        });
        out.push("</tr>");
      });
      out.push("</tbody></table>");
      return out.join("");
    },

    /** Applies a counts document to loaded nodes: child counts, rollup cells, and flags. */
    invalidateChildren(w) {
      const pending = (w.children || []).slice();
      let removedSelection = null;
      while (pending.length) {
        const child = pending.pop();
        if (child.children) for (const descendant of child.children) pending.push(descendant);
        child._invalidated = true;
        if (this.keyMap.get(child.key) === child) this.keyMap.delete(child.key);
        if (this.selected.delete(child) && !removedSelection) removedSelection = child;
        if (this.anchor === child) this.anchor = null;
      }
      w.children = null;
      w.next = null;
      w.error = null;
      w.expanded = false;
      w._v = 0;
      return removedSelection;
    },

    applyCounts(doc, fromRefresh = false) {
      if (this.destroyed) return;
      checkDocument(doc, "counts");
      let removedSelection = null;
      doc.items.forEach((item) => {
        const w = this.keyMap.get(item.id);
        if (w && w.inline && item.childCount != null && item.childCount !== w.h.children.length) {
          throw new Error("CanopyX: inline childCount must equal children length.");
        }
      });
      if (!fromRefresh && this.countRevisions) {
        for (const id of new Set(doc.items.map((item) => item.id))) {
          this.countRevisions.set(id, (this.countRevisions.get(id) || 0) + 1);
        }
      }
      doc.items.forEach((item) => {
        const w = this.keyMap.get(item.id);
        if (!w) {
          return;
        }
        w._v = 0;
        if (typeof item.childCount === "number") {
          w.h.childCount = item.childCount;
          w.total = item.childCount;
          if (!w.inline) {
            w.h.hasChildren = item.childCount > 0;
            const loaded = w.children ? w.children.length : 0;
            if (w.loading) w.pendingChildCount = item.childCount;
            else if (item.childCount < loaded || (item.childCount > loaded && w.children && !w.next))
              removedSelection = this.invalidateChildren(w) || removedSelection;
            else if (item.childCount === loaded) {
              w.next = null;
              w.error = null;
            }
            if (!item.childCount && (!w.children || !w.children.length)) w.expanded = false;
          }
        }
        if (item.cells) {
          w.h.cells = Object.assign(Object.create(null), w.h.cells, item.cells);
        }
        if (Array.isArray(item.flags)) {
          w.h.flags = item.flags.slice();
        }
      });
      this.applySort(this.root, true);
      this.relayout();
      if (removedSelection) this.selectionChanged(removedSelection);
    },

    async refreshCounts(ids) {
      if (this.destroyed || !this.source.counts) {
        return null;
      }
      const wanted = ids || this.rows.filter((w) => !w.status).map((w) => w.key);
      const revisions = this.countRevisions || (this.countRevisions = new Map());
      const mine = new Map(wanted.map((id) => [id, (revisions.get(id) || 0) + 1]));
      mine.forEach((revision, id) => revisions.set(id, revision));
      const doc = await this.source.counts(wanted);
      if (this.destroyed) return null;
      checkDocument(doc, "counts");
      this.applyCounts(Object.assign({}, doc, { items: doc.items.filter((item) => mine.has(item.id) && mine.get(item.id) === revisions.get(item.id)) }), true);
      return doc;
    },

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      if (this.restoreController) this.restoreController.abort();
      if (this.cancelResize) this.cancelResize();
      clearTimeout(this.saveTimer);
      if (this.cancelSearch) this.cancelSearch();
      cancelAnimationFrame(this.rafId);
      this.resizeObserver.disconnect();
      this.grid.removeEventListener("scroll", this.onScroll);
      global.removeEventListener("beforeprint", this.onPrint);
      [this.toolbar, this.grid, this.live, this.outline].forEach((element) => element.remove());
      this.host.removeAttribute("data-cx-ready");
      this.host.removeAttribute("data-canopyx-mounted");
    }
  });
