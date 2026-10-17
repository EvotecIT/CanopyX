
  // ---------- tree grid: toolbar (search box and filter switches; the tree tools part adds the menus) ----------
  Object.assign(TreeGrid.prototype, {
    buildToolbar() {
      const bar = this.toolbar, tools = this.tools;
      if (this.view.search && this.source.canSearch && tools.search !== false) this.buildSearch(bar, this.view.search);
      // A hidden filter has no switch here: the host draws the control and calls setFilterActive.
      if (tools.filters !== false) (this.view.filters || []).forEach((filter) => {
        if (filter.hidden) return;
        const label = h("label", "cx-switch");
        const input = h("input");
        input.type = "checkbox";
        input.setAttribute("data-cx-filter", filter.id);
        input.addEventListener("change", () => {
          const pending = this.setFilterActive(filter.id, input.checked);
          if (pending && pending.catch) pending.catch(() => {});
        });
        label.appendChild(input);
        label.appendChild(document.createTextNode(filter.label));
        bar.appendChild(label);
      });
      this.syncToolbar();
      // The Columns, Views, Export and more menus, column fitting and auto height come from the tree tools part. A tree
      // whose part cannot load or install keeps its search and filter switches and reports the error.
      this.toolsReady = loadPart(TREE_TOOLS).then(() => this.destroyed || this.installTools()).catch(error => this.emit("error", { error }));
    },

    syncToolbar() { this.toolbar.hidden = !this.toolbar.firstChild || this.opts.toolbar === false; },
    syncColumnControls() {},

    /**
     * Turns the declared filters off, for a host predicate that replaces them or to reveal a row they hide, and
     * tells the host when that changed something.
     */
    clearDeclaredFilters() {
      if (!this.activeFilters.size) {
        return;
      }
      this.activeFilters.clear();
      this.toolbar.querySelectorAll("[data-cx-filter]").forEach((input) => { input.checked = false; });
      this.emit("filter", { active: [] });
      this.stateChanged();
    },

    /** Combobox search: typing lists hits, arrows move through them, Enter expands the tree to the chosen hit. */
    buildSearch(bar, options) {
      const box = h("div", "cx-search");
      const input = h("input", "cx-search-input");
      const list = h("ul", "cx-results");
      const status = h("span", "cx-sr-only");
      list.id = this.id + "-results";
      list.hidden = true;
      const labels = this.labels;
      const count = (value) => numberFormat(this.lang).format(value);
      list.setAttribute("role", "listbox");
      list.setAttribute("aria-label", labels.searchResults);
      input.type = "search";
      input.placeholder = options.placeholder || labels.searchPlaceholder;
      input.setAttribute("aria-label", options.placeholder || labels.searchPlaceholder);
      input.setAttribute("role", "combobox");
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-expanded", "false");
      input.setAttribute("aria-controls", list.id);
      status.setAttribute("aria-live", "polite");
      let timer = 0;
      let blurTimer = 0;
      let sequence = 0;
      let navigation = null;
      const cancelNavigation = () => { if (navigation) navigation.abort(); };
      let hits = [];
      let active = -1;
      const close = () => {
        list.hidden = true;
        active = -1;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
      };
      const flyout = watchFlyout(box, list, () => !list.hidden);
      this.disposeSearchFlyout = flyout.dispose;
      const choose = async (index) => {
        const hit = hits[index];
        if (!hit) {
          return;
        }
        cancelNavigation();
        const current = navigation = new AbortController();
        close();
        try {
          await this.expandPath(hit.path, { select: true, focus: true, signal: current.signal });
        } catch (err) {
          if (!this.destroyed && !current.signal.aborted) setText(status, fill(labels.searchFailed, { error: err.message }));
        }
      };
      const show = (result) => {
        hits = result.hits || [];
        list.textContent = "";
        hits.forEach((hit, index) => {
          const item = h("li", "cx-result");
          item.id = list.id + "-" + index;
          item.setAttribute("role", "option");
          item.setAttribute("aria-selected", "false");
          const label = h("span", "cx-result-label");
          setText(label, hit.label);
          item.appendChild(label);
          if (hit.kind) {
            const kind = h("span", "cx-result-kind");
            setText(kind, hit.kind);
            item.appendChild(kind);
          }
          if (hit.context) {
            const context = h("span", "cx-result-context");
            setText(context, hit.context);
            item.appendChild(context);
          }
          item.addEventListener("mousedown", (e) => {
            e.preventDefault();
          });
          item.addEventListener("click", () => choose(index));
          list.appendChild(item);
        });
        list.hidden = !hits.length;
        flyout.position();
        input.setAttribute("aria-expanded", hits.length ? "true" : "false");
        setText(status, !hits.length ? labels.searchNoResults : !result.truncated ? fill(labels.searchResultCount, { count: count(hits.length) }) :
          result.total ? fill(labels.searchResultCountOfTotal, { count: count(hits.length), total: count(result.total) }) : fill(labels.searchResultCountOfMany, { count: count(hits.length) }));
      };
      const run = async () => {
        if (this.destroyed) return;
        const query = trimSeparators(input.value);
        if (query.length < options.minLength) {
          sequence++;
          close();
          setText(status, query ? fill(labels.searchTooShort, { min: count(options.minLength) }) : "");
          return;
        }
        const mine = ++sequence;
        try {
          const result = await this.search(query, options.maxResults);
          if (!this.destroyed && mine === sequence) {
            show(result);
          }
        } catch (err) {
          if (!this.destroyed && mine === sequence) {
            // A bundle's index cannot answer a query whose words are all one character long: say what to type.
            setText(status, err && err.code === "too-short" ? fill(labels.searchWordTooShort, { min: count(2) }) :
              fill(labels.searchFailed, { error: err && err.message ? err.message : err }));
          }
        }
      };
      const move = (delta) => {
        if (list.hidden || !hits.length) {
          return;
        }
        if (active >= 0) {
          list.children[active].setAttribute("aria-selected", "false");
        }
        active = active < 0 ? (delta < 0 ? hits.length - 1 : 0) : (active + delta + hits.length) % hits.length;
        const item = list.children[active];
        item.setAttribute("aria-selected", "true");
        input.setAttribute("aria-activedescendant", item.id);
        item.scrollIntoView({ block: "nearest" });
      };
      input.addEventListener("input", () => {
        cancelNavigation();
        sequence++;
        // Results for the previous text are stale as soon as the text changes; Enter waits for the new ones.
        clearTimeout(timer);
        hits = [];
        close();
        timer = setTimeout(run, 150);
      });
      input.addEventListener("keydown", (e) => {
        if (e.defaultPrevented || e.isComposing) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          move(e.key === "ArrowDown" ? 1 : -1);
        } else if (e.key === "Enter") {
          if (!list.hidden) {
            choose(active >= 0 ? active : 0);
          }
        } else if (e.key === "Escape") {
          cancelNavigation();
          sequence++;
          clearTimeout(timer);
          if (list.hidden) {
            input.value = "";
          }
          close();
        } else {
          return;
        }
        e.preventDefault();
      });
      input.addEventListener("blur", () => {
        cancelNavigation();
        sequence++;
        clearTimeout(timer);
        clearTimeout(blurTimer);
        blurTimer = setTimeout(close, 150);
      });
      this.cancelSearch = () => { cancelNavigation(); sequence++; clearTimeout(timer); clearTimeout(blurTimer); hits = []; close(); };
      box.appendChild(input);
      box.appendChild(list);
      box.appendChild(status);
      bar.appendChild(box);
      this.searchInput = input;
    }
  });
