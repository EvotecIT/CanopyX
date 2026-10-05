  // ---------- search input and the accepted query's visible conditions ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridResultCount: "{count} of {total} rows", gridClearQuery: "Clear search and filters",
    gridRemoveSearch: "Clear search: {search}", gridGroupedFilters: "Grouped filters ({count} conditions)",
    gridRemoveGroup: "Clear grouped filters", gridRemoveCondition: "Remove condition: {condition}"
  }));

  Object.assign(DataGrid.prototype, {
    buildGridSearch() {
      const search = h("div", "cx-search"), input = this.searchInput = h("input", "cx-search-input"), signal = this.lifetime.signal;
      input.type = "search"; input.placeholder = this.labels.searchPlaceholder; input.setAttribute("aria-label", this.labels.searchPlaceholder);
      const update = () => {
        clearTimeout(this.searchTimer); this.searchTimer = null;
        if (this.destroyed || this.searchComposing) return;
        if (this.queryForChange().search === input.value) return;
        this.setQuery(gridQueryStart(this.queryForChange(), { search: input.value })).catch(() => {});
      };
      GRID_REPORTING.search?.(this, update);
      const schedule = () => {
        clearTimeout(this.searchTimer); this.searchTimer = null;
        if (this.searchComposing) return;
        if (this.searchDelayMs === 0) update(); else this.searchTimer = setTimeout(update, this.searchDelayMs);
      };
      input.addEventListener("compositionstart", () => { this.searchComposing = true; clearTimeout(this.searchTimer); this.searchTimer = null; }, { signal: signal });
      input.addEventListener("compositionend", () => { this.searchComposing = false; schedule(); }, { signal: signal });
      input.addEventListener("input", event => { if (!event.isComposing) schedule(); }, { signal: signal });
      input.addEventListener("keydown", event => {
        if (event.key === "Enter" && !this.searchComposing && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); update(); }
      }, { signal: signal });
      search.appendChild(input); this.toolbar.appendChild(search);
    },

    buildQuerySummary() {
      this.querySummary = h("div", "cx-grid-query-summary");
      this.resultCount = h("span", "cx-grid-result-count"); this.resultCount.setAttribute("role", "status");
      this.queryChips = h("div", "cx-grid-query-chips");
      this.querySummary.append(this.resultCount, this.queryChips); this.toolbar.appendChild(this.querySummary);
    },

    syncQuerySummary() {
      if (!this.acceptedQuery || !this.querySummary) return;
      const query = this.acceptedQuery, active = document.activeElement, focused = this.queryChips.contains(active);
      const key = focused && active.getAttribute("data-cx-condition");
      const numbers = numberFormat(this.lang);
      setText(this.resultCount, this.snapshot.matched === null ? this.labels.gridUnknownCount : fill(this.snapshot.total === null ?
        this.labels.gridMatchedCount : this.labels.gridResultCount, { count: numbers.format(this.snapshot.matched), total: numbers.format(this.snapshot.total) }));
      this.queryChips.textContent = "";
      const apply = patch => {
        this.setQuery(gridQueryStart(this.queryForChange(true), patch)).catch(() => {});
      };
      const chip = (text, label, id, run) => {
        const button = gridButton(text + " ×", () => { button.focus({ preventScroll: true }); run(); }); button.classList.add("cx-grid-chip");
        button.title = text;
        button.setAttribute("aria-label", label); button.setAttribute("data-cx-condition", id); this.queryChips.appendChild(button);
      };
      if (query.search) chip(query.search, fill(this.labels.gridRemoveSearch, { search: query.search }), "search", () => {
        if (this.searchInput) this.searchInput.value = ""; apply({ search: "" });
      });
      query.filters.forEach((filter, index) => {
        const column = this.columns.find(item => item.id === filter.column), name = GRID_FILTER_LABELS[filter.operator];
        const condition = column.title + " " + (this.labels[name] || name) + (filter.values.length ? " " + filter.values.join(", ") : "");
        chip(condition, fill(this.labels.gridRemoveCondition, { condition: condition }), "filter-" + index, () => {
          const filters = this.queryForChange().filters.slice(), at = filters.findIndex(item => JSON.stringify(item) === JSON.stringify(filter));
          if (at >= 0) { filters.splice(at, 1); apply({ filters: filters }); }
        });
      });
      if (query.filterGroup) {
        const count = group => group.filters.length + group.groups.reduce((total, child) => total + count(child), 0);
        chip(fill(this.labels.gridGroupedFilters, { count: numbers.format(count(query.filterGroup)) }), this.labels.gridRemoveGroup, "group", () => {
          if (JSON.stringify(this.queryForChange().filterGroup) === JSON.stringify(query.filterGroup)) apply({ filterGroup: undefined });
        });
      }
      if (query.search || query.filters.length || query.filterGroup) {
        const clear = gridButton(this.labels.gridClearQuery, () => {
          clear.focus({ preventScroll: true });
          if (this.searchInput) this.searchInput.value = ""; apply({ search: "", filters: [], filterGroup: undefined });
        });
        clear.setAttribute("data-cx-condition", "clear"); this.queryChips.appendChild(clear);
      }
      if (focused) {
        const target = [...this.queryChips.children].find(button => button.getAttribute("data-cx-condition") === key);
        (target || this.queryChips.lastElementChild || this.searchInput || this.grid).focus({ preventScroll: true });
      }
    }
  });
