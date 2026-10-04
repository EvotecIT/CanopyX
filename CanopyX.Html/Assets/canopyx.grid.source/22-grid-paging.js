  // ---------- visible pages over the same offset query and virtual viewport ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridPaging: "Result pages", gridPageRange: "{first}–{last} of {count} rows",
    gridPageNumber: "Page", gridPageLength: "Rows per page", gridFirstPage: "First page",
    gridPreviousPage: "Previous page", gridNextPage: "Next page", gridLastPage: "Last page"
  }));
  function gridResultShape(query) { return JSON.stringify([query.search, query.searchMode, query.filters, query.filterGroup, query.sort]); }

  Object.assign(DataGrid.prototype, {
    getPaging() {
      const matched = this.rowCount(), total = this.snapshot ? this.snapshot.total : 0;
      return Object.freeze({ presentation: this.paged ? "paged" : "continuous", pageLength: this.pageLength,
        pageIndex: this.paged ? Math.floor(this.pageOffset / this.pageLength) : 0,
        pageCount: this.paged ? Math.ceil(matched / this.pageLength) : matched ? 1 : 0,
        first: matched ? this.pageOffset + 1 : 0, last: this.paged ? Math.min(matched, this.pageOffset + this.pageLength) : matched,
        matched: matched, total: total });
    },
    goToPage(index) {
      if (!this.paged || !this.acceptedQuery || !Number.isInteger(index) || index < 0)
        throw new Error("CanopyX: choose a nonnegative page in an accepted paged result.");
      const query = this.queryForChange(true), queuedSearch = query.search !== this.acceptedQuery.search;
      const page = queuedSearch ? 0 : Math.min(index, Math.max(0, this.getPaging().pageCount - 1));
      const request = gridQuery(this.view, Object.assign({}, query, { offset: page * this.pageLength, limit: this.pageSize,
        revision: queuedSearch ? undefined : query.revision })), key = JSON.stringify(request);
      const pending = this.pendingPageNavigation;
      if (pending && pending.epoch === this.queryEpoch && pending.key === key) return pending.promise;
      const operation = this.setQuery(request), navigation = { epoch: this.queryEpoch, key: key };
      navigation.promise = operation.finally(() => { if (this.pendingPageNavigation === navigation) this.pendingPageNavigation = null; });
      this.pendingPageNavigation = navigation; return navigation.promise;
    },
    setPageLength(length) {
      if (!this.paged || !this.acceptedQuery || !Number.isInteger(length) || length < 1 || length > 10000)
        throw new Error("CanopyX: visible page length is an integer from 1 to 10000 for an accepted paged result.");
      const query = this.queryForChange(true), queuedSearch = query.search !== this.acceptedQuery.search;
      return this.setQuery(Object.assign({}, query, { offset: queuedSearch ? 0 : Math.floor(this.pageOffset / length) * length,
        limit: this.pageSize, revision: queuedSearch ? undefined : query.revision }), { pageLength: length });
    },
    buildPager() {
      if (!this.paged) return;
      const pager = this.pager = h("form", "cx-grid-pager"), signal = this.lifetime.signal;
      pager.hidden = this.opts.toolbar === false;
      pager.setAttribute("aria-label", this.labels.gridPaging);
      this.pageRange = h("span", "cx-grid-page-range"); this.pageRange.setAttribute("role", "status"); pager.appendChild(this.pageRange);
      const run = action => { try { Promise.resolve(action()).catch(() => {}); } catch (error) { this.emit("error", { error: error }); } };
      this.pageButtons = [
        gridButton(this.labels.gridFirstPage, () => run(() => this.goToPage(0))),
        gridButton(this.labels.gridPreviousPage, () => run(() => this.goToPage(Math.max(0, this.getPaging().pageIndex - 1)))),
        gridButton(this.labels.gridNextPage, () => run(() => this.goToPage(this.getPaging().pageIndex + 1))),
        gridButton(this.labels.gridLastPage, () => run(() => this.goToPage(Math.max(0, this.getPaging().pageCount - 1))))
      ];
      pager.append(this.pageButtons[0], this.pageButtons[1]);
      const number = this.pageNumber = h("input"); number.type = "number"; number.min = "1"; number.step = "1"; number.required = true;
      pager.appendChild(gridInputLabel(this.labels.gridPageNumber, number));
      pager.append(this.pageButtons[2], this.pageButtons[3]);
      const length = this.pageLengthChoice = h("select");
      pager.appendChild(gridInputLabel(this.labels.gridPageLength, length));
      length.addEventListener("change", () => run(() => this.setPageLength(Number(length.value))), { signal: signal });
      pager.addEventListener("submit", event => { event.preventDefault(); if (number.checkValidity()) run(() => this.goToPage(Number(number.value) - 1)); }, { signal: signal });
      this.host.appendChild(pager); this.syncPager();
    },
    syncPager() {
      if (!this.pager) return;
      const paging = this.getPaging(), busy = !this.acceptedQuery || !!this.pendingQuery;
      const numbers = new Intl.NumberFormat(this.lang);
      setText(this.pageRange, fill(this.labels.gridPageRange, { first: numbers.format(paging.first), last: numbers.format(paging.last), count: numbers.format(paging.matched) }));
      this.pageNumber.value = String(paging.pageCount ? paging.pageIndex + 1 : 1);
      this.pageNumber.max = String(Math.max(1, paging.pageCount)); this.pageNumber.disabled = busy || !paging.pageCount;
      this.pageButtons.forEach((button, index) => { button.disabled = busy || !paging.pageCount || (index < 2 ? paging.pageIndex === 0 : paging.pageIndex >= paging.pageCount - 1); });
      this.pageLengthChoice.replaceChildren();
      [...new Set([25, 50, 100, 250, this.pageLength])].sort((a, b) => a - b).forEach(value => {
        const option = h("option"); option.value = String(value); setText(option, numbers.format(value)); this.pageLengthChoice.appendChild(option);
      });
      this.pageLengthChoice.value = String(this.pageLength); this.pageLengthChoice.disabled = busy;
      const active = document.activeElement;
      if (!busy && this.pageButtons.includes(active) && active.disabled && !this.pageNumber.disabled) this.pageNumber.focus({ preventScroll: true });
    },
    async focusResult(index, focus, column, control) {
      const columnId = column >= 0 && this.visibleColumns()[column] ? this.visibleColumns()[column].id : null;
      // Loading rows have no cell DOM. Keep the latest column intent until arrival or an explicit focus change.
      const navigation = { index: index, columnId: columnId, epoch: this.queryEpoch, focus: focus };
      this.pendingNavigation = navigation;
      try {
        const pendingPage = this.pendingPageNavigation;
        if (this.paged && (index < this.rowBounds().first || index > this.rowBounds().last ||
            this.pendingQuery && pendingPage && pendingPage.epoch === this.queryEpoch)) {
          const operation = this.goToPage(Math.floor(index / this.pageLength));
          navigation.epoch = this.queryEpoch; await operation;
        }
        if (this.pendingNavigation !== navigation) return;
        if (this.destroyed || this.pendingQuery) throw new DOMException("Grid navigation was superseded.", "AbortError");
        const epoch = this.queryEpoch, ownsFocus = focus && this.canvas.contains(document.activeElement);
        this.setFocus(this.rowItem(index), ownsFocus);
        navigation.epoch = epoch; this.pendingNavigation = navigation;
        const navigationTop = this.logicalTop();
        const row = await this.waitForRow(index, epoch);
        if (this.destroyed || epoch !== this.queryEpoch || this.pendingQuery) throw new DOMException("Grid navigation was superseded.", "AbortError");
        if (this.pendingNavigation !== navigation) return;
        if (focus && (!ownsFocus || !this.canvas.contains(document.activeElement) || !this.focused || this.focused._ri !== index)) return;
        const currentColumn = columnId ? this.visibleColumns().findIndex(item => item.id === columnId) : -1;
        if (!focus || currentColumn < 0 || !row || row.status) {
          if (this.logicalTop() === navigationTop) this.setFocus(row, focus);
        } else {
          const currentTop = this.logicalTop();
          this.focusCell(row, currentColumn, control);
          if (currentTop !== navigationTop) { this.setLogicalTop(currentTop); this.render(); }
        }
      } finally { if (this.pendingNavigation === navigation) this.pendingNavigation = null; }
    }
  });
