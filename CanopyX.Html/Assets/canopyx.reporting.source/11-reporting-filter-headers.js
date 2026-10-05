  // Header filtering is column-scoped in the shared grid owner.
  function reportingColumnFiltered(query,id) { return gridColumnFiltered(query,id); }
  DataGrid.prototype.syncReportingFilterHeaders = function () {};
  DataGrid.prototype.openReportingColumnFilter = function (id) { return this.openColumnFilter(id,this.headRow.querySelector('[data-cx-filter-column="'+CSS.escape(id)+'"]')); };
  DataGrid.prototype.focusReportingFilterHeader = function () { this.headRow.querySelector('[data-cx-filter-column="'+CSS.escape(this.reportingFilterReturn||"")+'"]')?.focus({preventScroll:true}); };
