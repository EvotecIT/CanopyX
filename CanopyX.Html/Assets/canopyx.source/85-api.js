
  // ---------- tree grid: remembered state, deep links, outline, counts ----------
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  Object.assign(TreeGrid.prototype, {
    pathOf(w) {
      const path = [];
      for (let node = w; node && node !== this.root; node = node.parent) {
        path.unshift(node.key);
      }
      return path;
    },

    getExpandedPaths() {
      const out = [];
      const walk = (w) => {
        for (const child of w.children || []) {
          if (child.expanded && child.children) {
            out.push(this.pathOf(child));
            walk(child);
          }
        }
      };
      walk(this.root);
      return out;
    },

    async setState(state) {
      if (!state || !Array.isArray(state.expanded)) {
        return;
      }
      this.restoring = true;
      try {
        const paths = state.expanded.slice().sort((a, b) => a.length - b.length);
        for (const path of paths) {
          try {
            await this.expandPath(path, { select: false, focus: false, reveal: false, expandLast: true });
          } catch (e) {
            // A remembered node may no longer exist.
          }
        }
      } finally {
        this.restoring = false;
      }
    },

    stateKey() {
      return this.view.stateKey ? "canopyx:" + this.view.stateKey : null;
    },

    stateChanged() {
      const key = this.stateKey();
      if (!key || this.restoring) {
        return;
      }
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
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
      params.push(prefix + this.pathOf(w).map(encodeURIComponent).join("/"));
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
          if (detail.type === "html") {
            setText(content, detail.html);
          } else {
            this.renderDetail(w.h, content);
          }
          out.push("<tr><td" + pad + " colspan=\"" + cols.length + "\">" + content.innerHTML + "</td></tr>");
          return;
        }
        out.push("<tr>");
        cols.forEach((column, i) => {
          const index = this.columns.indexOf(column);
          out.push("<td" + (i === 0 ? pad : "") + ">" + escapeHtml(cellText(this.cellOf(w.h, column, index), column, this.lang)) + "</td>");
        });
        out.push("</tr>");
      });
      out.push("</tbody></table>");
      return out.join("");
    },

    /** Applies a counts document to loaded nodes: child counts, rollup cells, and flags. */
    applyCounts(doc) {
      checkDocument(doc, "counts");
      (doc.items || []).forEach((item) => {
        const w = this.keyMap.get(item.id);
        if (!w) {
          return;
        }
        if (typeof item.childCount === "number") {
          w.h.childCount = item.childCount;
          w.total = item.childCount;
        }
        if (item.cells) {
          w.h.cells = Object.assign({}, w.h.cells, item.cells);
        }
        if (Array.isArray(item.flags)) {
          w.h.flags = item.flags.slice();
        }
      });
      this.version++;
      this.applySort(this.root, true);
      this.relayout();
    },

    async refreshCounts(ids) {
      if (!this.source.counts) {
        return null;
      }
      const wanted = ids || this.rows.filter((w) => !w.status).map((w) => w.key);
      const doc = await this.source.counts(wanted);
      this.applyCounts(doc);
      return doc;
    },

    destroy() {
      this.resizeObserver.disconnect();
      this.grid.removeEventListener("scroll", this.onScroll);
      global.removeEventListener("beforeprint", this.onPrint);
      [this.toolbar, this.grid, this.live, this.outline].forEach((element) => element.remove());
      this.host.removeAttribute("data-cx-ready");
      this.host.removeAttribute("data-canopyx-mounted");
    }
  });
