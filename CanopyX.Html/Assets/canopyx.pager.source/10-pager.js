  // ---------- pager controls: the part behind a paged view's pager settings (docs/paging.md) ----------
  // A paged view's pager object chooses the page-size choices, whether the page-size menu, the page number field and the
  // first and last buttons show, numbered page buttons, and the result text. The built-in pager is built as before and then
  // adjusted, so its keyboard model, labels and phone layout stay the same; views without pager settings keep it unchanged.
  const BUILD_PAGER = DataGrid.prototype.buildPager, SYNC_PAGER = DataGrid.prototype.syncPager;
  const PAGER_INFO = ["range", "sentence", "none"];

  /** Reads and checks a view's pager settings; "all" is offered for inline data only. */
  function pagerSettings(view) {
    const pager = view.pager, fail = name => { throw new Error("CanopyX: invalid pager " + name + "."); };
    if (!pager || typeof pager !== "object" || Array.isArray(pager)) fail("settings");
    const flag = (name, fallback) => {
      if (pager[name] !== undefined && typeof pager[name] !== "boolean") fail(name);
      return pager[name] === undefined ? fallback : pager[name];
    };
    const numbers = pager.numbers === undefined ? 0 : pager.numbers;
    if (!Number.isInteger(numbers) || numbers !== 0 && (numbers < 5 || numbers > 15)) fail("numbers");
    if (pager.info !== undefined && !PAGER_INFO.includes(pager.info)) fail("info");
    let lengths = null;
    if (pager.lengths !== undefined) {
      if (!Array.isArray(pager.lengths) || !pager.lengths.length || pager.lengths.length > 16) fail("lengths");
      const seen = new Set();
      lengths = pager.lengths.map(entry => {
        const item = entry !== null && typeof entry === "object" ? entry : { value: entry };
        if (item.value !== "all" && !(Number.isInteger(item.value) && item.value >= 1 && item.value <= 10000) || seen.has(item.value) ||
            item.label !== undefined && (typeof item.label !== "string" || !item.label.trim() || item.label.length > 64)) fail("lengths");
        seen.add(item.value);
        return { value: item.value, label: item.label };
      }).filter(item => item.value !== "all" || view.source.kind === "inline");
    }
    return { lengths, numbers, info: pager.info || "range", lengthMenu: flag("lengthMenu", true), pageInput: flag("pageInput", !numbers), firstLast: flag("firstLast", true) };
  }

  /** The pages a numbered pager shows, with null for a gap: every page when they fit, else the first, the last and a window. */
  function pagerWindow(current, count, max) {
    const range = (start, end) => Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index);
    if (count <= max) return range(0, count);
    if (current < max - 3) return [...range(0, max - 2), null, count - 1];
    if (current > count - max + 2) return [0, null, ...range(count - max + 2, count)];
    const inner = max - 4, start = current - Math.floor((inner - 1) / 2);
    return [0, null, ...range(start, start + inner), null, count - 1];
  }
  // A gap that would stand for a single page shows that page instead.
  function pagerPages(current, count, max) {
    return pagerWindow(current, count, max).map((page, index, pages) => page === null && pages[index + 1] - pages[index - 1] === 2 ? pages[index - 1] + 1 : page);
  }

  Object.assign(DataGrid.prototype, {
    buildPager() {
      if (!this.paged || !this.view.pager) return BUILD_PAGER.call(this);
      const settings = pagerSettings(this.view), previous = this.pager;
      this.pagerSettings = settings;
      BUILD_PAGER.call(this);
      // The part may arrive after the grid built its first pager; the new one takes the same place.
      if (previous && previous !== this.pager) previous.replaceWith(this.pager);
      this.pager.hidden = this.opts.toolbar === false;
      this.pager.classList.add("cx-pager-custom");
      this.pageLengthChoice.closest(".cx-rpp").hidden = !settings.lengthMenu;
      if (this.pageNumber) this.pageNumber.closest(".pg").hidden = !settings.pageInput;
      if (!settings.firstLast) [this.pageButtons[0], this.pageButtons[3]].forEach(button => { if (button) button.hidden = true; });
      this.pageRange.hidden = settings.info === "none";
      if (settings.numbers && !this.cursor) { this.pageList = h("span", "cx-pages"); this.pageButtons[1].after(this.pageList); }
      this.syncPager();
    },
    syncPager() {
      const before = document.activeElement;
      SYNC_PAGER.call(this);
      const settings = this.pagerSettings;
      if (!this.pager || !settings) return;
      const paging = this.getPaging(), busy = !this.acceptedQuery || !!this.pendingQuery, numbers = numberFormat(this.lang);
      // A pager button that became disabled (Previous on the first page) hands focus to a control that shows, as the
      // built-in pager does with the page number field, which these settings may hide.
      if (!busy && this.pager.contains(before) && before.disabled && (document.activeElement === before || !this.pager.contains(document.activeElement))) {
        if (this.pageList) this.pageListFocus = true;
        else [...this.pager.querySelectorAll("button,select,input")].find(control => !control.disabled && !control.closest("[hidden]"))?.focus({ preventScroll: true });
      }
      if (settings.lengths) {
        const choice = this.pageLengthChoice, current = this.pageAll ? "all" : this.pageLength, items = settings.lengths.slice();
        // The current length stays choosable: before the first longer choice, or before All.
        if (!items.some(item => item.value === current)) {
          const at = items.findIndex(item => item.value === "all" || item.value > current);
          items.splice(at < 0 ? items.length : at, 0, { value: current });
        }
        choice.replaceChildren(...items.map(item => gridOption(item.value, item.label || (item.value === "all" ? this.labels.gridAll : numbers.format(item.value)))));
        choice.value = String(current);
      }
      if (settings.info === "sentence" && paging.matched !== null) {
        gridCountLabel(this.pageRange, paging.matched < paging.total ? this.labels.gridPageInfoFiltered : this.labels.gridPageInfo, { first: numbers.format(paging.first),
          last: numbers.format(paging.last), count: numbers.format(paging.matched), total: numbers.format(paging.total) }, /(\{first\}.*?\{last\})/);
      }
      if (this.pageList) this.syncPageList(paging, busy, numbers);
    },
    // Numbered page buttons: the current page is marked for assistive technology, and keeps focus after a page change.
    syncPageList(paging, busy, numbers) {
      // A page change keeps focus on the current page unless the reader has moved on to another control meanwhile.
      const list = this.pageList, active = document.activeElement;
      const refocus = list.contains(active) || this.pageListFocus && (!active || active === document.body || this.pager.contains(active));
      // Phones (640 px and below, as the phone layout) show five at most; the host width is known before the layout pass.
      const width = this.host.clientWidth, max = width && width <= 640 ? Math.min(5, this.pagerSettings.numbers) : this.pagerSettings.numbers;
      list.replaceChildren(...pagerPages(paging.pageIndex, paging.pageCount, max).map(index => {
        if (index === null) { const gap = h("span", "cx-gap"); gap.setAttribute("aria-hidden", "true"); setText(gap, "…"); return gap; }
        const page = numbers.format(index + 1), button = gridButton(page, () => {
          this.pageListFocus = true;
          try { this.goToPage(index).catch(() => {}); } catch (error) { this.emit("error", { error }); }
        });
        button.classList.add("cx-page"); button.setAttribute("aria-label", fill(this.labels.gridPageButton, { page }));
        if (index === paging.pageIndex) button.setAttribute("aria-current", "page");
        button.disabled = busy; return button;
      }));
      if (refocus && !busy) list.querySelector("[aria-current]")?.focus({ preventScroll: true });
      this.pageListFocus = refocus && busy;
    }
  });
  GRID_PAGER_IMPL.installed = true;
