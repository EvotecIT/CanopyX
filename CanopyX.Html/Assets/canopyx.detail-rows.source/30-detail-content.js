  // ---------- detail content: a host template, trusted HTML, a nested grid or tree, or the record's own payload ----------
  // Content is created on first expand and stays until the record collapses, the result drops it or the grid is destroyed;
  // its signal aborts then, and a nested view is destroyed. The body stays inside the visible width of the grid. Events from
  // inside it stop at the body, so the outer grid never acts on a nested grid's rows; Escape that nothing inside handles
  // (or Escape on a nested grid's row) returns focus to the detail row, and Escape there to the record.
  const DETAIL_FOCUSABLE = "a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex='-1']),[contenteditable=true]";
  Object.assign(DataGrid.prototype, {
    detailContent(id, record) {
      let entry = this.detailBodies.get(id);
      if (entry) return entry;
      // The body's own listeners live as long as the entry; the content's signal is renewed when a failed load is retried.
      const body = h("div", "cx-detail-body"), controller = new AbortController(), events = new AbortController(), signal = events.signal;
      body.tabIndex = -1; body.setAttribute("role", "group");
      const primary = this.visibleColumns()[0];
      body.setAttribute("aria-label", fill(this.labels.gridDetailOf, { record: record && primary && cellText(record.cells[primary.id], primary, this.fmt) || id }));
      entry = { body, controller, events, slot: this.detailSeq = (this.detailSeq || 0) + 1, api: null };
      this.detailBodies.set(id, entry);
      for (const type of ["click", "dblclick", "pointerover", "focusout", "contextmenu"]) body.addEventListener(type, event => event.stopPropagation(), { signal });
      body.addEventListener("focusin", event => {
        event.stopPropagation();
        const item = this.detailRecords.get(id);
        if (item && this.focused !== item) { this.pendingNavigation = null; this.focused = item; this.scheduleRender(); }
      }, { signal });
      body.addEventListener("keydown", event => {
        event.stopPropagation();
        if (event.key !== "Escape" || event.isComposing || event.defaultPrevented && !event.target.matches(".cx-row")) return;
        const item = this.detailRecords.get(id);
        if (item) { event.preventDefault(); this.setFocus(item, true); }
      }, { signal });
      entry.ready = this.fillDetail(entry, id, record);
      return entry;
    },
    async fillDetail(entry, id, record) {
      const body = entry.body, options = this.opts.detail || {}, declared = this.view.reporting?.detail || {}, signal = entry.controller.signal;
      const context = Object.freeze({ id, signal, api: this.host.canopyx, labels: this.labels,
        onDispose: cleanup => signal.addEventListener("abort", () => { try { cleanup(); } catch (error) { console.error(error); } }, { once: true }) });
      const row = gridFreeze(JSON.parse(JSON.stringify(record || { id, cells: {} })));
      setText(body, this.labels.loading); body.classList.add("cx-detail-pending");
      try {
        const renderer = declared.renderer && this.plugins.map(item => item.detailRenderers?.[declared.renderer]).find(item => typeof item === "function");
        if (typeof options.render === "function" || renderer) {
          body.replaceChildren(); await (renderer || options.render)(row, body, context);
        } else if (typeof options.html === "function") {
          const html = await options.html(row, context);
          if (typeof html !== "string") throw new Error("CanopyX: a detail html renderer returns a string.");
          if (!signal.aborted) body.innerHTML = html; // trusted host markup: hosts encode the record text they put in it
        } else if (declared.template) {
          const template = document.getElementById(declared.template);
          if (!(template instanceof HTMLTemplateElement)) throw new Error("CanopyX: the detail template is not a <template> element.");
          const fragment = template.content.cloneNode(true);
          for (const slot of fragment.querySelectorAll("[data-cx-field]")) {
            const column = this.columns.find(item => item.id === slot.getAttribute("data-cx-field"));
            setText(slot, column ? cellText(row.cells[column.id], column, this.fmt) : "");
          }
          body.replaceChildren(fragment);
        } else if (["grid", "tree", "source"].some(name => typeof options[name] === "function") || declared.view) {
          await this.nestedDetail(entry, row, context);
        } else this.payloadDetail(body, row.detail);
      } catch (error) {
        if (signal.aborted || this.destroyed) return;
        body.replaceChildren(); const message = h("p", "cx-detail-error");
        setText(message, fill(this.labels.gridDetailFailed, { error: error.message })); body.appendChild(message);
        body.appendChild(gridButton(this.labels.gridRetry, () => {
          entry.controller.abort(); entry.controller = new AbortController(); entry.api?.destroy(); entry.api = null;
          entry.ready = this.fillDetail(entry, id, record);
        }));
        this.emit("error", { error });
      } finally {
        body.classList.remove("cx-detail-pending");
        if (!this.destroyed) { this.detailMeasure = true; this.scheduleRender(); }
      }
    },
    // A nested grid or tree: the host returns { view, source?, options? }, or the definition's view takes the record's
    // payload ({ type: "grid", rows } or { type: "tree", roots }) as inline data, or a host source.
    async nestedDetail(entry, row, context) {
      const options = this.opts.detail || {}, declared = this.view.reporting?.detail || {};
      const factory = typeof options.grid === "function" ? options.grid : typeof options.tree === "function" ? options.tree : null;
      const spec = factory ? await factory(row, context) : null;
      if (factory && (!spec || typeof spec !== "object" || !spec.view || typeof spec.view !== "object"))
        throw new Error("CanopyX: a nested detail returns { view, source?, options? }.");
      if (!spec && !declared.view) throw new Error("CanopyX: a detail source needs the definition's detail view.");
      const source = spec ? spec.source : typeof options.source === "function" ? await options.source(row, context) : undefined;
      const view = JSON.parse(JSON.stringify(spec ? spec.view : declared.view)), tree = view.type === "tree", payload = row.detail;
      if (!view || !["grid", "tree"].includes(view.type)) throw new Error("CanopyX: a nested detail view is a grid or a tree document.");
      // A view without its own data takes the record's payload as inline data.
      if (!source && view.source?.kind !== "host" && (tree ? !view.roots?.length : !view.rows?.length)) {
        if (tree ? payload?.type !== "tree" || !Array.isArray(payload.roots) : payload?.type !== "grid" || !Array.isArray(payload.rows))
          throw new Error("CanopyX: the record has no " + (tree ? "tree" : "grid") + " detail payload.");
        view.source = { kind: "inline" }; if (tree) view.roots = payload.roots; else view.rows = payload.rows;
      }
      // Nested views of different records never share remembered state.
      delete view.stateKey; delete view.deepLink;
      if (context.signal.aborted) return;
      const host = h("div", "cx-detail-view");
      host.setAttribute("data-cx-theme", this.host.getAttribute("data-cx-theme") || "auto");
      entry.body.replaceChildren(host);
      // A nested view starts without its own toolbar (sorting stays in its headers); the host's options can bring it back.
      entry.api = (tree ? createTreeGrid : createDataGrid)(host, { labels: this.opts.labels, toolbar: false, ...(spec?.options || {}), view, ...(source ? { source } : {}) });
      await entry.api.ready;
    },
    // Table, property list or trusted HTML payloads draw as a tree's detail rows do.
    payloadDetail(body, payload) {
      if (!payload || typeof payload !== "object" || !["table", "properties", "html"].includes(payload.type) ||
          payload.type === "table" && (!Array.isArray(payload.columns) || !Array.isArray(payload.rows) || payload.rows.some(item => !Array.isArray(item))) ||
          payload.type === "properties" && !Array.isArray(payload.items) || payload.type === "html" && typeof payload.html !== "string")
        throw new Error("CanopyX: a detail payload is a table, properties or html; grid and tree payloads need the definition's detail view.");
      const holder = h("div");
      TreeGrid.prototype.renderDetail.call({ opts: {}, fmt: this.fmt }, { detail: payload }, holder);
      body.replaceChildren(...holder.firstChild.childNodes);
    },
    disposeDetail(id) {
      const entry = this.detailBodies?.get(id);
      if (!entry) return;
      this.detailBodies.delete(id); entry.controller.abort(); entry.events.abort();
      try { entry.api?.destroy(); } catch (error) { console.error(error); }
      entry.body.remove(); this.detailHeights.delete(id);
    },
    enterDetail(row) {
      const entry = this.detailBodies.get(row.detailOf);
      if (!entry) return;
      if (entry.api?.focus) { entry.api.focus(); return; }
      const target = [...entry.body.querySelectorAll(DETAIL_FOCUSABLE)].find(element => element.getClientRects().length) || entry.body;
      target.focus({ preventScroll: true });
    },
    // Keys on the detail row itself: Enter or F2 moves into the content, Escape back to the record.
    detailRowKey(event, row) {
      if (row.status !== "detail" || event.target.closest(".cx-detail-body")) return false;
      if (["Enter", "F2"].includes(event.key)) { event.preventDefault(); this.enterDetail(row); return true; }
      if (event.key === "Escape") {
        event.preventDefault();
        const record = this.rowCache.get(row.ordinal);
        if (record) this.setFocus(record, true); else this.focusResult(row.ordinal, true).catch(() => {});
        return true;
      }
      if (["ArrowLeft", "ArrowRight", " "].includes(event.key)) { event.preventDefault(); return true; }
      return false;
    }
  });

