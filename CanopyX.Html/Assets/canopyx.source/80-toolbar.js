
  // ---------- tree grid: toolbar (search box, filter switches, column chooser) ----------
  Object.assign(TreeGrid.prototype, {
    buildToolbar() {
      const bar = this.toolbar;
      let any = false;
      if (this.view.search && this.source.canSearch) {
        this.buildSearch(bar, this.view.search);
        any = true;
      }
      (this.view.filters || []).forEach((filter) => {
        const label = h("label", "cx-switch");
        const input = h("input");
        input.type = "checkbox";
        input.setAttribute("data-cx-filter", filter.id);
        input.addEventListener("change", () => this.setFilterActive(filter.id, input.checked));
        label.appendChild(input);
        label.appendChild(document.createTextNode(filter.label));
        bar.appendChild(label);
        any = true;
      });
      if (this.columns.length > 1) {
        this.buildColumnChooser(bar);
        any = true;
      }
      bar.hidden = !any;
    },

    /** Combobox search: typing lists hits, arrows move through them, Enter expands the tree to the chosen hit. */
    buildSearch(bar, options) {
      const box = h("div", "cx-search");
      const input = h("input", "cx-search-input");
      const list = h("ul", "cx-results");
      const status = h("span", "cx-sr-only");
      list.id = this.id + "-results";
      list.hidden = true;
      list.setAttribute("role", "listbox");
      list.setAttribute("aria-label", "Search results");
      input.type = "search";
      input.placeholder = options.placeholder || "Search";
      input.setAttribute("aria-label", options.placeholder || "Search");
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
          if (!this.destroyed && !current.signal.aborted) setText(status, err.message);
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
        input.setAttribute("aria-expanded", hits.length ? "true" : "false");
        setText(status, hits.length ? hits.length + (result.truncated ? " of " + (result.total || "many") : "") + " results" : "No results");
      };
      const run = async () => {
        if (this.destroyed) return;
        const query = trimSeparators(input.value);
        if (query.length < options.minLength) {
          sequence++;
          close();
          setText(status, query ? "Type at least " + options.minLength + " characters" : "");
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
            setText(status, "Search failed: " + (err && err.message ? err.message : err));
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
        if (e.isComposing) return;
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
        sequence++;
        clearTimeout(timer);
        clearTimeout(blurTimer);
        blurTimer = setTimeout(close, 150);
      });
      this.cancelSearch = () => { cancelNavigation(); sequence++; clearTimeout(timer); clearTimeout(blurTimer); };
      box.appendChild(input);
      box.appendChild(list);
      box.appendChild(status);
      bar.appendChild(box);
      this.searchInput = input;
    },

    /** A native disclosure with one checkbox per hideable column; the tree column always stays. */
    buildColumnChooser(bar) {
      const details = h("details", "cx-columns");
      const summary = h("summary");
      setText(summary, "Columns");
      const group = h("fieldset", "cx-columns-list");
      const legend = h("legend", "cx-sr-only");
      setText(legend, "Visible columns");
      group.appendChild(legend);
      this.columns.slice(1).forEach((column) => {
        const label = h("label");
        const input = h("input");
        input.type = "checkbox";
        input.checked = !column.hidden;
        input.setAttribute("data-cx-column", column.id);
        input.addEventListener("change", () => this.setColumnVisible(column.id, input.checked));
        label.appendChild(input);
        label.appendChild(document.createTextNode(column.title));
        group.appendChild(label);
      });
      details.appendChild(summary);
      details.appendChild(group);
      bar.appendChild(details);
    }
  });
