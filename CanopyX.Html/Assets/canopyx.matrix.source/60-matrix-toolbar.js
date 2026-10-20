  // ---------- matrix: the toolbar (search, the Rows and Columns panels, only problems) and the legend ----------
  // Each axis panel sorts (name, total, an attribute or as listed), groups by an attribute and filters by the values of the
  // attributes marked facet, with their counts. Filters are the grid's "in" filters on attribute values, kept in the state.
  Object.assign(MatrixView.prototype, {
    buildBar() {
      const labels = this.labels, signal = this.lifetime.signal, bar = this.bar;
      const search = this.searchInput = h("input", "cx-mx-input cx-mx-search");
      search.type = "search"; search.placeholder = labels.matrixSearch; search.setAttribute("aria-label", labels.matrixSearch); search.autocomplete = "off";
      search.addEventListener("input", () => { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.setQuery({ search: search.value }), 150); }, { signal });
      this.axisButtons = {};
      for (const axis of MATRIX_AXES) {
        const button = h("button", "cx-mx-button"); button.type = "button"; button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-expanded", "false");
        button.addEventListener("click", () => this.togglePanel(axis), { signal });
        this.axisButtons[axis] = button;
      }
      const toggle = this.attentionToggle = h("input", "cx-mx-check"), switchLabel = h("label", "cx-mx-switch"), switchText = h("span");
      toggle.type = "checkbox"; setText(switchText, labels.matrixOnlyProblems); switchLabel.append(toggle, switchText);
      toggle.addEventListener("change", () => this.setQuery({ attentionOnly: toggle.checked }), { signal });
      this.attentionSwitch = switchLabel; this.attentionText = switchText;
      const clear = this.clearButton = h("button", "cx-mx-button cx-mx-clear"); clear.type = "button"; setText(clear, labels.matrixClearFilters);
      clear.addEventListener("click", () => { search.value = ""; this.setQuery({ search: "", filters: { rows: {}, columns: {} }, attentionOnly: false }); search.focus(); }, { signal });
      this.summary = h("span", "cx-mx-summary"); this.summary.setAttribute("aria-live", "off");
      this.panel = h("div", "cx-mx-panel"); this.panel.setAttribute("role", "dialog"); this.panel.hidden = true;
      // Escape closes the panel wherever focus is (a checkbox click does not focus it in every browser).
      document.addEventListener("keydown", event => { if (event.key === "Escape" && !this.panel.hidden && !event.defaultPrevented) { event.preventDefault(); this.closePanel(true); } }, { signal });
      document.addEventListener("pointerdown", event => { if (!this.panel.hidden && !this.panel.contains(event.target) && !Object.values(this.axisButtons).includes(event.target.closest("button"))) this.closePanel(false); }, { signal });
      bar.append(search, this.axisButtons.rows, this.axisButtons.columns, switchLabel, clear, this.summary, this.panel);
    },
    /** The bar's texts and the only-problems switch, from the labels and the document. */
    refreshBar() {
      const labels = this.labels;
      this.searchInput.placeholder = labels.matrixSearch; this.searchInput.setAttribute("aria-label", labels.matrixSearch);
      setText(this.attentionText, labels.matrixOnlyProblems); setText(this.clearButton, labels.matrixClearFilters);
      this.attentionSwitch.hidden = !this.doc.states.some(state => state.attention);
    },
    axisTitle(axis) { return axis === "rows" ? this.doc.rows.title || this.labels.matrixRows : this.doc.columnTitle || this.labels.matrixColumns; },
    activeFilters(axis) { return Object.values(this.query.filters[axis]).reduce((sum, values) => sum + (values && values.length ? 1 : 0), 0); },
    syncBar() {
      const query = this.query;
      for (const axis of MATRIX_AXES) {
        const count = this.activeFilters(axis), button = this.axisButtons[axis];
        setText(button, this.axisTitle(axis) + (count ? " (" + count + ")" : ""));
        button.classList.toggle("cx-mx-active", !!count || !!query.group[axis]);
      }
      this.attentionToggle.checked = query.attentionOnly;
      if (this.searchInput.value !== query.search && document.activeElement !== this.searchInput) this.searchInput.value = query.search;
      this.clearButton.hidden = !(query.search || query.attentionOnly || this.activeFilters("rows") || this.activeFilters("columns"));
      setText(this.summary, this.summaryText());
      if (!this.panel.hidden) this.fillPanel(this.panelAxis);
    },
    summaryText() {
      const labels = this.labels, model = this.model, doc = this.doc, f = value => this.format.format(value);
      const filtered = model.visible.rows !== doc.rows.items.length || model.visible.columns !== doc.columns.items.length;
      const size = filtered ? fill(labels.matrixShown, { rows: f(model.visible.rows), totalRows: f(doc.rows.items.length), columns: f(model.visible.columns), totalColumns: f(doc.columns.items.length) }) :
        fill(labels.matrixSize, { rows: f(model.visible.rows), columns: f(model.visible.columns) });
      let attention = 0;
      doc.states.forEach((state, index) => { if (state.attention) attention += model.counts[index]; });
      return size + (doc.states.some(state => state.attention) ? " · " + fill(labels.matrixAttention, { count: f(attention) }) : "");
    },
    paintLegend() {
      if (!this.doc.legend) return;
      const items = [], counts = this.model.counts;
      this.doc.states.forEach((state, index) => {
        const item = h("span", "cx-mx-key"), swatch = h("span", "cx-mx-swatch" + (state.attention ? " cx-mx-attn" : "")), text = h("span"), count = h("span", "cx-mx-keycount");
        item.setAttribute("role", "listitem");
        applyTone(swatch, swatch.className, toneOf(state.tone));
        const symbol = matrixSymbol(state.symbol); if (symbol) swatch.appendChild(symbol);
        setText(text, state.label); setText(count, this.format.format(counts[index]));
        item.append(swatch, text, count); items.push(item);
      });
      const none = counts[this.doc.states.length];
      if (none) {
        const item = h("span", "cx-mx-key"), swatch = h("span", "cx-mx-swatch cx-mx-none"), text = h("span"), count = h("span", "cx-mx-keycount");
        item.setAttribute("role", "listitem"); setText(text, this.labels.matrixNoData); setText(count, this.format.format(none));
        item.append(swatch, text, count); items.push(item);
      }
      this.legend.replaceChildren(...items);
    },
    togglePanel(axis) {
      if (!this.panel.hidden && this.panelAxis === axis) { this.closePanel(true); return; }
      this.panelAxis = axis; this.fillPanel(axis); this.panel.hidden = false;
      for (const name of MATRIX_AXES) this.axisButtons[name].setAttribute("aria-expanded", String(name === axis));
      this.panel.querySelector("select,input")?.focus();
    },
    closePanel(returnFocus) {
      if (this.panel.hidden) return;
      this.panel.hidden = true;
      for (const name of MATRIX_AXES) this.axisButtons[name].setAttribute("aria-expanded", "false");
      if (returnFocus) this.axisButtons[this.panelAxis].focus();
    },
    fillPanel(axis) {
      const labels = this.labels, doc = this.doc, data = doc[axis === "rows" ? "rows" : "columns"], query = this.query, panel = this.panel, signal = this.lifetime.signal;
      panel.setAttribute("aria-label", this.axisTitle(axis));
      const focused = panel.contains(document.activeElement) ? document.activeElement.dataset.cxControl : null;
      const field = (text, control) => { const label = h("label", "cx-mx-field"), name = h("span"); setText(name, text); label.append(name, control); return label; };
      const select = (options, value, change, key) => {
        const element = h("select", "cx-mx-input"); element.dataset.cxControl = key;
        for (const [optionValue, text] of options) { const option = h("option"); option.value = optionValue; setText(option, text); element.appendChild(option); }
        element.value = value; element.addEventListener("change", () => change(element.value), { signal }); return element;
      };
      const sort = query.sort[axis];
      const sortBy = select([["", labels.matrixAsListed], ["#label", labels.matrixByLabel], ["#total", labels.matrixByTotal], ...data.attributes.map(attribute => [attribute.id, attribute.title])],
        sort ? sort.by : "", value => this.sort(axis, value || null, value === "#total" ? "desc" : query.sort[axis]?.direction || "asc"), "sort");
      const descending = h("input", "cx-mx-check"); descending.type = "checkbox"; descending.checked = !!sort && sort.direction === "desc"; descending.disabled = !sort; descending.dataset.cxControl = "direction";
      descending.addEventListener("change", () => this.sort(axis, query.sort[axis]?.by || null, descending.checked ? "desc" : "asc"), { signal });
      const descendingLabel = h("label", "cx-mx-switch"), descendingText = h("span"); setText(descendingText, labels.matrixDescending); descendingLabel.append(descending, descendingText);
      const groupBy = select([["", labels.matrixNoGrouping], ...data.attributes.map(attribute => [attribute.id, attribute.title])], query.group[axis] || "", value => this.group(axis, value || null), "group");
      const children = [field(labels.matrixSortBy, sortBy), descendingLabel];
      if (data.attributes.length) children.push(field(labels.matrixGroupBy, groupBy));
      for (const attribute of data.attributes.filter(item => item.facet)) children.push(this.facetList(axis, data, attribute));
      const close = h("button", "cx-mx-button"); close.type = "button"; setText(close, labels.matrixClose); close.dataset.cxControl = "close";
      close.addEventListener("click", () => this.closePanel(true), { signal });
      children.push(close);
      panel.replaceChildren(...children);
      if (focused) panel.querySelector('[data-cx-control="' + CSS.escape(focused) + '"]')?.focus();
    },
    facetList(axis, data, attribute) {
      const set = h("fieldset", "cx-mx-facet"), legend = h("legend"), counts = new Map(), chosen = new Set(this.query.filters[axis][attribute.id] || []), signal = this.lifetime.signal;
      setText(legend, attribute.title); set.appendChild(legend);
      for (const item of data.items) {
        const key = matrixValueKey(item.values[attribute.id]);
        if (!counts.has(key)) counts.set(key, { key, text: matrixValueText(item.values[attribute.id], attribute, this.format) || "—", count: 0 });
        counts.get(key).count++;
      }
      for (const value of [...counts.values()].sort((a, b) => matrixNatural(a.text, b.text)).slice(0, 200)) {
        const label = h("label", "cx-mx-switch"), box = h("input", "cx-mx-check"), text = h("span"), count = h("span", "cx-mx-keycount");
        box.type = "checkbox"; box.checked = chosen.has(value.key); box.dataset.cxControl = "facet:" + attribute.id + ":" + value.key;
        box.addEventListener("change", () => {
          const next = new Set(this.query.filters[axis][attribute.id] || []);
          if (box.checked) next.add(value.key); else next.delete(value.key);
          this.filter(axis, attribute.id, [...next]);
        }, { signal });
        setText(text, value.text); setText(count, this.format.format(value.count));
        label.append(box, text, count); set.appendChild(label);
      }
      return set;
    }
  });
