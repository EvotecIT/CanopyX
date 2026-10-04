  // ---------- header filter entry points and focus return ----------
  function reportingColumnFiltered(query, id) {
    const has = group => group && (group.filters.some(filter => filter.column === id) || group.groups.some(has));
    return !!query && (query.filters.some(filter => filter.column === id) || !!has(query.filterGroup));
  }

  Object.assign(DataGrid.prototype, {
    buildHeader() {
      const active = document.activeElement, focused = active && this.headRow.contains(active) && active.getAttribute("data-cx-filter-column");
      REPORT_FILTER_BASE.buildHeader.call(this);
      if (!this.view.reporting || !this.view.reporting.headerFilters || this.opts.toolbar === false) return;
      for (const cell of this.headCells) {
        const id = cell.getAttribute("data-cx-column"), column = this.columns.find(item => item.id === id);
        const button = gridButton("⌕", () => this.openReportingColumnFilter(id)); button.classList.add("cx-grid-header-filter");
        button.setAttribute("data-cx-filter-column", id); button.setAttribute("aria-label", fill(this.labels.gridHeaderFilter, { column: column.title }));
        button.title = button.getAttribute("aria-label"); button.setAttribute("aria-controls", this.reportingFilters.panel.id);
        cell.insertBefore(button, cell.querySelector(".cx-resize"));
        if (focused === id) button.focus({ preventScroll: true });
      }
      this.syncReportingFilterHeaders();
    },
    syncReportingFilterHeaders() {
      if (!this.reportingFilters) return;
      for (const button of this.headRow.querySelectorAll("[data-cx-filter-column]")) {
        const id = button.getAttribute("data-cx-filter-column");
        button.setAttribute("aria-expanded", String(this.reportingFilters.details.open && this.reportingFilterReturn === id));
        button.setAttribute("data-cx-filtered", String(reportingColumnFiltered(this.acceptedQuery, id)));
      }
    },
    openReportingColumnFilter(id) {
      this.reportingFilterColumn = id; this.reportingFilterReturn = id;
      if (this.reportingFilters.details.open) this.renderGridFilters(this.reportingFilters.panel);
      else this.reportingFilters.details.open = true;
      this.syncReportingFilterHeaders();
    },
    focusReportingFilterHeader() {
      const button = [...this.headRow.querySelectorAll("[data-cx-filter-column]")].find(item =>
        item.getAttribute("data-cx-filter-column") === this.reportingFilterReturn);
      (button || this.reportingFilters.details.querySelector("summary")).focus({ preventScroll: true });
    }
  });
