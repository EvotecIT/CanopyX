  // ---------- visible pages over the same offset query and virtual viewport ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridPaging: "Result pages", gridPageRange: "{first}–{last} of {count} rows",
    gridPageNumber: "Page", gridPageLength: "Rows per page", gridFirstPage: "First page",
    gridPreviousPage: "Previous page", gridNextPage: "Next page", gridLastPage: "Last page",
    gridUnknownCount: "Result count unavailable", gridMatchedCount: "{count} matching rows", gridCursorRange: "Rows {first}–{last}",
    gridPageInfo: "Showing {first} to {last} of {count} rows", gridPageInfoFiltered: "Showing {first} to {last} of {count} rows (filtered from {total})",
    gridPageButton: "Page {page}"
  }));
  function gridResultShape(query) { return JSON.stringify([query.search, query.searchMode, query.filters, query.filterGroup, query.sort]); }

  Object.assign(DataGrid.prototype, {
    getPaging() {
      const window = this.cursorWindow, count = this.cursor ? window ? window.end - this.pageOffset : 0 : this.rowCount();
      return Object.freeze({ presentation: this.paged ? "paged" : "continuous", pageLength: this.pageLength,
        first: count ? this.pageOffset + 1 : 0, last: this.cursor ? count ? window.end : 0 :
          this.paged ? Math.min(count, this.pageOffset + this.pageLength) : count,
        matched: this.snapshot ? this.snapshot.matched : this.cursor ? null : 0,
        total: this.snapshot ? this.snapshot.total : this.cursor ? null : 0,
        ...this.cursor ? { navigation: "cursor", pageIndex: null, pageCount: null,
        hasNext: !!(window && window.next !== undefined), hasPrevious: !!(window && window.previous !== undefined) } : {
        pageIndex: this.paged ? Math.floor(this.pageOffset / this.pageLength) : 0,
        pageCount: this.paged ? Math.ceil(count / this.pageLength) : count ? 1 : 0 } });
    },
    goToPage(index) {
      if (this.cursor || !this.paged || !this.acceptedQuery || !Number.isInteger(index) || index < 0)
        throw new Error("CanopyX: choose a nonnegative page in an accepted paged result.");
      const query = this.queryForChange(true), queuedSearch = query.search !== this.acceptedQuery.search;
      const page = queuedSearch ? 0 : Math.min(index, Math.max(0, this.getPaging().pageCount - 1));
      const request = gridQuery(this.view, Object.assign({}, query, { offset: page * this.pageLength, limit: this.pageSize,
        revision: queuedSearch ? undefined : query.revision }));
      return this.navigatePageQuery(request);
    },
    navigatePageQuery(request, paging) {
      const key = JSON.stringify(request);
      const pending = this.pendingPageNavigation;
      if (pending && pending.epoch === this.queryEpoch && pending.key === key) return pending.promise;
      const operation = this.setQuery(request, paging), navigation = { epoch: this.queryEpoch, key };
      navigation.promise = operation.finally(() => { if (this.pendingPageNavigation === navigation) this.pendingPageNavigation = null; });
      this.pendingPageNavigation = navigation; return navigation.promise;
    },
    setPageLength(length) {
      const all=length==="all";if(all){if(this.view.source.kind!=="inline")throw new Error("CanopyX: All rows needs inline data.");length=Math.max(1,(this.view.rowData?.count??this.view.rows.length));}
      if (!this.paged || !this.acceptedQuery || !Number.isInteger(length) || length < 1 || length > Math.max(10000,this.view.source.kind==="inline"?(this.view.rowData?.count??this.view.rows.length):0))
        throw new Error("CanopyX: visible page length is an integer from 1 to 10000 for an accepted paged result.");
      const query = this.queryForChange(true), queuedSearch = query.search !== this.acceptedQuery.search;
      if (this.cursor) return this.setQuery(gridQueryStart(query), { pageLength: length, allRows: all });
      return this.setQuery(Object.assign({}, query, { offset: queuedSearch ? 0 : Math.floor(this.pageOffset / length) * length,
        limit: this.pageSize, revision: queuedSearch ? undefined : query.revision }), { pageLength: length, allRows: all });
    },
    validateCursorTransition(page, paging) {
      const end = page.offset + page.items.length;
      if (paging.direction === "first" && page.offset !== 0 || paging.direction === "next" && page.offset !== paging.edge ||
          paging.direction === "previous" && end !== paging.edge)
        throw new Error("CanopyX: cursor pages must be contiguous.");
      if (paging.direction !== "first") {
        const identities = new Set([...this.rowCache.values()].map(row => row.key));
        if (page.items.some(row => identities.has(row.id))) throw new Error("CanopyX: cursor pages repeat a row ID.");
      }
    },
    navigateCursor(direction) {
      if (!this.acceptedQuery || !this.cursorWindow || !this.cursor)
        throw new Error("CanopyX: no accepted cursor page.");
      const query = this.queryForChange(true), changed = gridResultShape(query) !== gridResultShape(this.acceptedQuery);
      let cursor = direction === "next" ? this.cursorWindow.next : direction === "previous" ? this.cursorWindow.previous : undefined;
      if (changed) { direction = "first"; cursor = undefined; }
      if (direction !== "first" && cursor === undefined) {
        if (!this.pendingQuery) return Promise.resolve(this.acceptedQuery);
        direction = "first";
      }
      const request = gridQuery(this.view, { ...query, cursor, limit: this.pageLength,
        revision: changed ? undefined : this.snapshot.revision });
      const paging = { pageLength: this.pageLength, direction,
        edge: direction === "next" ? this.cursorWindow.end : this.pageOffset };
      return this.navigatePageQuery(request, paging);
    },
    firstPage() { return this.cursor ? this.navigateCursor("first") : this.goToPage(0); },
    previousPage() { return this.cursor ? this.navigateCursor("previous") : this.goToPage(Math.max(0, this.getPaging().pageIndex - 1)); },
    nextPage() { return this.cursor ? this.navigateCursor("next") : this.goToPage(this.getPaging().pageIndex + 1); },
    buildPager() {
      if (!this.paged) return;
      const pager = this.pager = h("form", "cx-grid-pager"), signal = this.lifetime.signal;
      // A view with pager settings shows its pager once the pager part has rebuilt it (52-grid-pager-part.js).
      pager.hidden = this.opts.toolbar === false || !!this.view.pager;
      pager.setAttribute("aria-label", this.labels.gridPaging);
      this.pageRange = h("span", "cx-grid-page-range"); this.pageRange.setAttribute("role", "status");
      const run = action => { try { Promise.resolve(action()).catch(() => {}); } catch (error) { this.emit("error", { error }); } };
      this.pageButtons = [
        gridButton(this.labels.gridFirstPage, () => run(() => this.firstPage())),
        gridButton(this.labels.gridPreviousPage, () => run(() => this.previousPage())),
        gridButton(this.labels.gridNextPage, () => run(() => this.nextPage()))
      ];
      if (!this.cursor) this.pageButtons.push(gridButton(this.labels.gridLastPage, () => run(() => this.goToPage(Math.max(0, this.getPaging().pageCount - 1)))));
      const navigation=h("span","cx-pager");navigation.append(this.pageButtons[0],this.pageButtons[1]);
      this.pageButtons.forEach((button,index)=>{const label=button.textContent;button.replaceChildren(gridIcon(["first","previous","next","last"][index]));button.setAttribute("aria-label",label);button.title=label;});
      if (!this.cursor) {
        const number = this.pageNumber = h("input"); number.type = "number"; number.min = "1"; number.step = "1"; number.required = true;
        number.setAttribute("aria-label",this.labels.gridPageNumber);
        const field=gridInputLabel(this.labels.gridPageNumber,number);field.classList.add("pg");this.pageOf=h("span");field.appendChild(this.pageOf);navigation.appendChild(field);
      }
      navigation.append(...this.pageButtons.slice(2));
      const length = this.pageLengthChoice = h("select");
      const rpp=gridInputLabel(this.labels.gridPageLength,length);rpp.classList.add("cx-rpp");pager.append(this.pageRange,rpp,navigation);
      length.addEventListener("change", () => run(() => this.setPageLength(length.value==="all"?"all":Number(length.value))), { signal });
      pager.addEventListener("submit", event => { event.preventDefault();
        if (this.pageNumber && this.pageNumber.checkValidity()) run(() => this.goToPage(Number(this.pageNumber.value) - 1)); }, { signal });
      this.host.appendChild(pager); this.syncPager();
    },
    syncPager() {
      if (!this.pager) return;
      const paging = this.getPaging(), busy = !this.acceptedQuery || !!this.pendingQuery;
      const numbers = numberFormat(this.lang);
      gridCountLabel(this.pageRange, paging.matched === null ? this.labels.gridCursorRange : this.labels.gridPageRange,
        { first: numbers.format(paging.first), last: numbers.format(paging.last), count: numbers.format(paging.matched) }, /(\{first\}.*?\{last\})/);
      if (this.pageNumber) {
        this.pageNumber.value = String(paging.pageCount ? paging.pageIndex + 1 : 1);
        setText(this.pageOf,fill(this.labels.gridPageOf,{page:"",pages:numbers.format(Math.max(1,paging.pageCount))}).trim());
        this.pageNumber.max = String(Math.max(1, paging.pageCount)); this.pageNumber.disabled = busy || !paging.pageCount;
      }
      this.pageButtons.forEach((button, index) => { button.disabled = busy || (this.cursor ? index === 0 ? this.pageOffset === 0 :
        index === 1 ? !paging.hasPrevious : !paging.hasNext : !paging.pageCount || (index < 2 ? paging.pageIndex === 0 : paging.pageIndex >= paging.pageCount - 1)); });
      this.pageLengthChoice.replaceChildren();
      [...new Set([10,25,50,100,...this.pageAll?[]:[this.pageLength]])].sort((a, b) => a - b)
        .forEach(value => this.pageLengthChoice.appendChild(gridOption(value, numbers.format(value))));
      if(this.view.source.kind==="inline")this.pageLengthChoice.appendChild(gridOption("all",this.labels.gridAll));
      this.pageLengthChoice.value = this.pageAll?"all":String(this.pageLength); this.pageLengthChoice.disabled = busy;
      const active = document.activeElement;
      const fallback = this.pageNumber || this.pageLengthChoice;
      if (!busy && this.pageButtons.includes(active) && active.disabled && !fallback.disabled) fallback.focus({ preventScroll: true });
    },
    async focusResult(index, focus, column, control) {
      const columnId = column >= 0 && this.visibleColumns()[column] ? this.visibleColumns()[column].id : null;
      // Loading rows have no cell DOM. Keep the latest column intent until arrival or an explicit focus change.
      const navigation = { index, columnId, epoch: this.queryEpoch, focus };
      this.pendingNavigation = navigation;
      try {
        const pendingPage = this.pendingPageNavigation;
        if (this.cursor && (index < this.rowBounds().first || index > this.rowBounds().last))
          throw new Error("CanopyX: cursor keys stay inside the accepted page.");
        if (this.paged && !this.cursor && (index < this.rowBounds().first || index > this.rowBounds().last ||
            this.pendingQuery && pendingPage && pendingPage.epoch === this.queryEpoch)) {
          // Positions belong to the accepted result. Uncommitted search text cannot redefine them.
          const request = gridQuery(this.view, Object.assign({}, this.acceptedQuery, {
            offset: Math.floor(index / this.pageLength) * this.pageLength, limit: this.pageSize }));
          const operation = this.navigatePageQuery(request);
          navigation.epoch = this.queryEpoch; await operation;
        }
        if (this.pendingNavigation !== navigation) return;
        if (this.destroyed || this.pendingQuery) throw new DOMException("Grid navigation was superseded.", "AbortError");
        if (index < this.rowBounds().first || index > this.rowBounds().last)
          throw new Error("CanopyX: row position is outside the accepted result page.");
        const epoch = this.queryEpoch, ownsFocus = focus && this.canvas.contains(document.activeElement);
        const initial = this.rowItem(index);
        this.setFocus(initial, ownsFocus);
        navigation.epoch = epoch; this.pendingNavigation = navigation;
        // A cached row is already revealed and painted. Reading scrollTop again would flush the new cell styles.
        if (focus === false && column == null && control == null && initial && !initial.status &&
            !this.destroyed && !this.dataLifetime.signal.aborted && epoch === this.queryEpoch && !this.pendingQuery &&
            this.pendingNavigation === navigation && this.rowCache.get(index) === initial && this.focused === initial &&
            this.rendered.get(initial)?.isConnected) return;
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
