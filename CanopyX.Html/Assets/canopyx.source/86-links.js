
  // ---------- tree grid: deep links ----------
  // With deepLink on the view, the selected row is written to the URL fragment, and a fragment expands its row on load
  // and whenever it changes. By default the fragment is "cx.<view id>=<id path>" next to any other "&" parameters. A
  // host with a scheme of its own, such as "#record/42", supplies formatLink and parseLink and owns the whole fragment.
  Object.assign(TreeGrid.prototype, {
    deepLinkName() {
      return "cx." + encodeURIComponent(this.view.id);
    },

    hashParams() {
      return (global.location.hash || "").replace(/^#/, "").split("&").filter(Boolean);
    },

    /** The part of the current fragment that is this view's link: the whole fragment with a host scheme. */
    currentLink() {
      if (this.opts.parseLink) {
        return (global.location.hash || "").replace(/^#/, "");
      }
      const prefix = this.deepLinkName() + "=";
      const param = this.hashParams().find((p) => p.startsWith(prefix));
      return param ? param.slice(prefix.length) : null;
    },

    /**
     * Expands and selects the row the fragment names. A fragment this grid wrote or already opened is left alone,
     * and a newer fragment cancels the one that is still being opened.
     */
    async openDeepLink() {
      const link = this.view.deepLink ? this.currentLink() : null;
      if (link == null || link === this.link) {
        if (link == null) this.link = null;
        return;
      }
      this.link = link;
      if (this.linkOpening) this.linkOpening.abort();
      const current = this.linkOpening = new AbortController();
      try {
        const ids = this.opts.parseLink ? await this.opts.parseLink(link) : link.split("/").filter(Boolean).map(decodeURIComponent);
        // A host's parseLink returns null for a fragment that does not name a row of this view.
        if (Array.isArray(ids) && ids.length && !this.destroyed && !current.signal.aborted &&
            !await this.expandPath(ids, { select: true, focus: false, signal: current.signal }) && !current.signal.aborted) {
          this.link = null;
        }
      } catch (e) {
        if (!current.signal.aborted) {
          // The same fragment can be tried again once whatever failed is back.
          this.link = null;
          this.announce(e && e.message ? e.message : String(e));
        }
      }
    },

    writeDeepLink(w) {
      if (!this.view.deepLink) {
        return;
      }
      let hash;
      if (this.opts.formatLink) {
        // The host decides what a selection looks like in the URL; null leaves the URL as it is. With nothing
        // selected it gets an empty path and no node. A failing host callback must not break selection.
        let link = null;
        try {
          link = this.opts.formatLink(w ? this.pathOf(w) : [], w ? w.h : null);
        } catch (e) {
          if (global.console) global.console.error(e);
        }
        if (link == null) {
          return;
        }
        hash = "#" + String(link).replace(/^#/, "");
      } else {
        const prefix = this.deepLinkName() + "=";
        const params = this.hashParams().filter((p) => !p.startsWith(prefix));
        if (w) params.push(prefix + this.pathOf(w).map(encodeURIComponent).join("/"));
        hash = "#" + params.join("&");
      }
      try {
        global.history.replaceState(global.history.state, "", hash);
      } catch (e) {
        global.location.hash = hash;
      }
      // Read back, because the browser may have encoded what was written.
      this.link = this.currentLink();
    }
  });
