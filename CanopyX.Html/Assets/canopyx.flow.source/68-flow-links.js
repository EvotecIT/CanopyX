  // ---------- flow: deep links per step (deepLinks, docs/flow.md#deep-links) ----------
  // With deepLinks the page's own address names the open step, #<flow id>/<step id> (#<flow id> for a task list's hub), the
  // way trees write theirs: replaceState, so steps do not fill the browser history. Opening the page, or following such a
  // link later, opens that step; in a linear flow a later step than the first incomplete one opens that step instead. A host
  // with a scheme of its own supplies formatLink(stepId) and parseLink(fragment). Answers never go in the address.
  Object.assign(FlowView.prototype, {
    /** What follows the first paint: drafts, presets the host keeps, deep links and a dialog a link opens. */
    startHostFeatures() {
      this.loadPresets?.();
      this.loadDraft?.();
      if (!this.model.deepLinks) return;
      const read = () => this.followLink();
      global.addEventListener("hashchange", read, { signal: this.lifetime.signal });
      queueMicrotask(read);
    },

    linkFor(step) {
      if (typeof this.options.formatLink === "function") {
        try { const link = this.options.formatLink(step.id); return typeof link === "string" ? link.replace(/^#/, "") : null; } catch (error) { this.report(error, "formatLink"); return null; }
      }
      return step === this.hub ? encodeURIComponent(this.model.id) : encodeURIComponent(this.model.id) + "/" + encodeURIComponent(step.id);
    },
    stepOfLink(fragment) {
      if (typeof this.options.parseLink === "function") {
        try { const id = this.options.parseLink(fragment); return typeof id === "string" ? id : null; } catch (error) { this.report(error, "parseLink"); return null; }
      }
      const [flow, step, extra] = fragment.split("/").map(part => { try { return decodeURIComponent(part); } catch (error) { return null; } });
      return flow === this.model.id && extra === undefined ? step ?? (this.hub ? this.hub.id : null) : null;
    },

    /** Opens the step the address names, when it names one of this flow. */
    followLink() {
      if (this.destroyed || this.phase !== "form") return;
      const fragment = global.location.hash.replace(/^#/, ""), id = fragment && this.stepOfLink(fragment);
      if (!id || id === this.step.id) return;
      if (this.dialog && !this.dialog.open) this.open();
      this.goTo(id).catch(error => this.report(error, "goTo"));
    },

    /** After a step change: the address names the open step, and the draft follows. */
    stepMoved() {
      this.draftChanged?.(true);
      if (!this.model.deepLinks || this.phase !== "form") return;
      const link = this.linkFor(this.step);
      if (link === null || global.location.hash === "#" + link) return;
      // A sandboxed document cannot change its address; the flow works the same without it.
      try { global.history.replaceState(global.history.state, "", global.location.href.replace(/#.*$/, "") + "#" + link); } catch (error) { return; }
    }
  });
