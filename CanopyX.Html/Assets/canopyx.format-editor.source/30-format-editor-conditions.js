  // ---------- conditions on the filter builder's rows, with the formatting operators; threshold bands ----------
  // Each condition row is the filter editor's own (addGridFilter, readGridFilter): column, operator, typed value and value
  // lists. The formatting operators join its operator list for the column's kind, an upper value appears for between, and
  // text conditions get a match-case switch. Groups combine with all, any or none, two levels deep as in Filters.
  const FORMAT_FILTER_OPERATORS = ["eq", "ne", "contains", "startsWith", "in", "gt", "ge", "lt", "le", "isNull", "isNotNull"];
  const FORMAT_EXTRA_OPERATORS = { text: ["notContains", "endsWith", "notIn", "like", "notLike", "matches", "notMatches"], number: ["notIn", "between", "betweenExclusive"],
    datetime: ["between", "betweenExclusive", "olderThan", "withinLast"] };
  Object.assign(DataGrid.prototype, {
    formatConditionBuilder(container, initial) {
      const labels = this.formatLabels, grid = this, names = { notContains: labels.formatNotContains, endsWith: labels.formatEndsWith, notIn: labels.formatNotIn,
        like: labels.formatLike, notLike: labels.formatNotLike, matches: labels.formatMatches, notMatches: labels.formatNotMatches, between: labels.formatBetween,
        betweenExclusive: labels.formatBetweenExclusive, olderThan: labels.formatOlderThan, withinLast: labels.formatWithinLast }, ranged = operator => operator === "between" || operator === "betweenExclusive";
      const invalid = () => { throw new Error(grid.labels.gridInvalidFilter); };
      const dateText = value => { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Date(date.getTime() - (grid.local ? date.getTimezoneOffset() * 60000 : 0)).toISOString().slice(0, 19) : ""; };
      const dateValue = text => { const date = new Date(grid.local ? text : text + "Z"); return Number.isFinite(date.getTime()) ? date.toISOString() : invalid(); };
      const typed = (column, text) => column.kind === "number" ? text.trim() && Number.isFinite(Number(text)) ? Number(text) : invalid() : column.kind === "datetime" ? dateValue(text) : text;
      const extend = (row, predicate) => {
        const fields = row._filter, upper = h("input", "cx-grid-filter-value"), upperField = gridInputLabel(this.labels.gridConditionUpperValue, upper);
        upperField.classList.add("cx-condition-upper"); upperField.hidden = true;
        const exact = gridButton("Aa", () => { exact.setAttribute("aria-pressed", String(exact.getAttribute("aria-pressed") !== "true")); fields.edited = true; });
        exact.classList.add("cx-format-case"); exact.setAttribute("aria-label", labels.formatMatchCase); exact.title = labels.formatMatchCase; exact.setAttribute("aria-pressed", String(!!predicate?.caseSensitive));
        fields.input.closest("label").after(upperField); row.insertBefore(exact, row.querySelector(":scope > button.icon"));
        const definition = () => this.columns.find(item => item.id === fields.column.value);
        const options = () => {
          for (const option of [...fields.operator.options]) if (option.dataset.cxFormat) option.remove();
          for (const name of FORMAT_EXTRA_OPERATORS[definition().kind] || []) { const option = gridOption(name, names[name]); option.dataset.cxFormat = "1"; fields.operator.appendChild(option); }
          exact.hidden = definition().kind !== "text";
        };
        const update = () => {
          const operator = fields.operator.value, kind = definition().kind, relative = operator === "olderThan" || operator === "withinLast";
          if (operator === "notIn") { fields.input.closest("label").hidden = fields.input.disabled = true; fields.multiple.parentNode.hidden = false; }
          upperField.hidden = upper.disabled = !ranged(operator);
          if (kind === "datetime") { fields.input.type = relative ? "number" : "datetime-local"; upper.type = "datetime-local"; }
          else upper.type = kind === "number" ? "number" : "text";
          upper.step = fields.input.step = "any"; if (relative) fields.input.min = "0";
        };
        fields.column.addEventListener("change", () => { options(); update(); });
        fields.operator.addEventListener("change", update);
        upper.addEventListener("input", () => { fields.edited = true; });
        options();
        if (predicate && names[predicate.operator]) {
          fields.operator.value = predicate.operator;
          const kind = definition().kind, show = value => kind === "datetime" && predicate.operator !== "olderThan" && predicate.operator !== "withinLast" ? dateText(value) : String(value);
          if (predicate.operator === "notIn") predicate.values.forEach(fields.multiple._add);
          else { fields.input.value = show(predicate.values[0]); if (ranged(predicate.operator)) upper.value = show(predicate.values[1]); }
        }
        update();
        // The whole predicate stays with its row: an untouched row saves it as it was, with its type, culture or value column.
        row._format = { upper, exact, source: predicate };
      };
      const read = row => {
        const fields = row._filter, operator = fields.operator.value, column = this.columns.find(item => item.id === fields.column.value);
        const source = row._format.source;
        if (source && !fields.edited) return [JSON.parse(JSON.stringify(source))];
        let predicates;
        if (operator === "notIn") { const values = [...fields.multiple._values.values()]; if (!values.length) invalid(); predicates = [{ column: column.id, operator, values }]; }
        else if (ranged(operator)) predicates = [{ column: column.id, operator, values: [typed(column, fields.input.value), typed(column, row._format.upper.value)] }];
        else if (operator === "olderThan" || operator === "withinLast") predicates = [{ column: column.id, operator, values: [Number(fields.input.value.trim() ? fields.input.value : invalid())] }];
        else if (names[operator]) predicates = [{ column: column.id, operator, values: [fields.input.value || invalid()] }];
        else predicates = [].concat(this.readGridFilter(row)).map(predicate => ({ ...predicate, values: predicate.values.slice() }));
        if (column.kind === "text" && row._format.exact.getAttribute("aria-pressed") === "true") predicates.forEach(predicate => { predicate.caseSensitive = true; });
        if (source && source.column === column.id) for (const predicate of predicates) for (const name of ["type", "culture"]) if (source[name] !== undefined) predicate[name] = source[name];
        return predicates;
      };
      const words = block => {
        const data = block._group;
        [...data.rows.children].forEach((row, index) => setText(row.querySelector(".w"), index === 0 ? this.labels.gridWhere : data.segment._value === "and" ? this.labels.gridAnd : data.segment._value === "or" ? this.labels.gridOr : labels.formatNone.toLowerCase()));
        for (const child of data.children.children) words(child);
      };
      const group = (parent, definition, depth) => {
        const block = h("div", depth ? "cx-grid-filter-group" : "cx-filter-root"), heading = h("div", "cx-group-h"), rows = h("div", "cx-condition-rows"),
          children = h("div", "cx-grid-filter-group-children"), actions = h("div", "cx-adds");
        const segment = formatSegment([["and", this.labels.gridFilterAll], ["or", this.labels.gridFilterAny], ["none", labels.formatNone]], definition?.operator || "and", this.labels.gridFilterMatch, () => words(root));
        heading.append(segment, document.createTextNode(" " + (depth ? this.labels.gridOfThese : this.labels.gridOfTheseAreTrue)));
        block._group = { segment, rows, children }; block.append(heading, rows, children, actions); parent.appendChild(block);
        const add = predicate => {
          if (container.querySelectorAll(".cx-grid-filter").length >= 64) return null;
          this.addGridFilter(rows, predicate && { column: predicate.column, operator: predicate.operator, values: predicate.values || [] }); const row = rows.lastElementChild;
          row._design = true; row.classList.add("cx-cond"); row._filter.type.closest("label").hidden = row._filter.type.value === "string";
          const word = h("span", "w"); row.prepend(word);
          const remove = row.querySelector(":scope > button");
          if (remove) { remove.replaceChildren(gridIcon("close")); remove.classList.add("icon"); remove.setAttribute("aria-label", this.labels.gridDeleteCondition); remove.addEventListener("click", () => words(root)); }
          extend(row, predicate); words(root || block); return row;
        };
        const condition = gridButton(this.labels.gridAddCondition, () => add(null)?._filter.column.focus()); condition.classList.add("cx-link");
        const nested = gridButton(this.labels.gridAddGroup, () => { group(children, null, depth + 1); words(root); }); nested.classList.add("cx-link"); nested.disabled = depth >= 2;
        actions.append(condition, nested);
        if (depth) {
          const remove = gridDecorateButton(gridButton("", () => { block.remove(); words(root); }), "close", true);
          remove.classList.add("icon"); remove.setAttribute("aria-label", this.labels.gridDeleteFilterGroup); heading.appendChild(remove);
        }
        (definition?.filters || []).forEach(add);
        (definition?.groups || []).forEach(child => group(children, child, depth + 1));
        if (!depth && !rows.children.length && !children.children.length) add(null);
        return block;
      };
      const readBlock = block => {
        const { segment, rows, children } = block._group, filters = [], groups = [...children.children].map(readBlock).filter(Boolean);
        for (const row of rows.children) {
          const predicates = read(row);
          if (segment._value !== "and" && predicates.length > 1) groups.push({ operator: "and", filters: predicates, groups: [] }); else filters.push(...predicates);
        }
        return filters.length || groups.length ? { operator: segment._value, filters, groups } : null;
      };
      let root = null;
      root = group(container, initial, 0); words(root);
      return { read: () => readBlock(root) || invalid(), focus: () => root.querySelector("select")?.focus() };
    },
    formatBandsEditor(box, bands, tones, register) {
      const labels = this.formatLabels, list = h("div", "cx-format-bands"), items = bands.map(band => ({ ...band }));
      const render = () => {
        list.replaceChildren();
        items.forEach((band, index) => {
          const row = h("div", "cx-format-band"), last = index === items.length - 1, tone = formatSelect(tones, band.tone), label = h("input");
          if (last) { const above = h("span", "cx-format-above"); setText(above, labels.formatAbove); row.appendChild(above); delete band.upperBound; }
          else { const bound = formatNumberInput(band.upperBound); bound.addEventListener("input", () => { band.upperBound = formatNumberValue(bound); }); row.appendChild(formatField(labels.formatUpTo, bound)); }
          label.type = "text"; label.maxLength = 64; label.value = band.label || ""; label.placeholder = labels.formatCue;
          tone.addEventListener("change", () => { band.tone = tone.value; }); label.addEventListener("input", () => { band.label = label.value.trim() || undefined; });
          row.append(formatField(labels.formatTone, tone), formatField(labels.formatCue, label));
          if (items.length > 1) row.appendChild(formatIconButton(labels.formatRemoveBand, "close", () => { items.splice(index, 1); render(); }));
          list.appendChild(row);
        });
      };
      const add = gridButton(labels.formatAddBand, () => { items.splice(items.length - 1, 0, { tone: "warning" }); render(); list.querySelector(".cx-format-band:nth-last-child(2) input")?.focus(); });
      add.classList.add("cx-link"); add.disabled = items.length >= 16;
      render(); box.append(list, add);
      register(() => items.map(band => ({ ...(band.upperBound === undefined ? {} : { upperBound: band.upperBound }), tone: band.tone, ...(band.label ? { label: band.label } : {}), ...(band.icon ? { icon: band.icon } : {}) })));
    }
  });
