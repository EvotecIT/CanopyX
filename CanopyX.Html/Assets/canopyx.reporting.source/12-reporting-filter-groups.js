  // ---------- composable controls over the existing bounded AND/OR query contract ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridFilterGroupTitle: "Additional grouped conditions", gridFilterMatch: "Match",
    gridFilterAll: "All conditions (AND)", gridFilterAny: "Any condition (OR)",
    gridAddFilterGroup: "Add condition group", gridDeleteFilterGroup: "Remove condition group"
  }));

  Object.assign(DataGrid.prototype, {
    buildReportingFilterGroups(form, error) {
      const section = h("section", "cx-grid-filter-groups"), title = h("p"), roots = h("div");
      setText(title, this.labels.gridFilterGroupTitle); title.id = this.id + "-filter-groups";
      section.setAttribute("aria-labelledby", title.id);
      const add = gridButton(this.labels.gridAddFilterGroup, () => {
        if (roots.children.length) return;
        const group = this.addReportingFilterGroup(roots, null, 1, form, error);
        if (group) group._group.operator.focus();
      });
      section.append(title, roots, add); form.appendChild(section);
      const group = this.queryForChange().filterGroup;
      if (group) this.addReportingFilterGroup(roots, group, 1, form, error);
      const sync = () => { add.disabled = roots.children.length !== 0; };
      roots._sync = sync; sync(); return roots;
    },

    addReportingFilterGroup(parent, definition, depth, form, error) {
      if (depth > 8 || form.querySelectorAll(".cx-grid-filter-group").length >= 64) {
        setText(error, this.labels.gridInvalidFilter); return null;
      }
      const group = h("fieldset", "cx-grid-filter-group"), legend = h("legend"), operator = h("select"),
        rows = h("div"), children = h("div", "cx-grid-filter-group-children"), actions = h("div", "cx-grid-filter-group-actions");
      setText(legend, this.labels.gridFilterGroupTitle);
      operator.append(gridOption("and", this.labels.gridFilterAll), gridOption("or", this.labels.gridFilterAny));
      operator.value = definition ? definition.operator : "and";
      group.append(legend, gridInputLabel(this.labels.gridFilterMatch, operator), rows, children, actions);
      group._group = { operator, rows, children }; parent.appendChild(group);
      const focusAfterRemove = (container, removed, fallback) => {
        const next = removed.nextElementSibling || removed.previousElementSibling;
        const hadFocus = removed.contains(document.activeElement); removed.remove();
        container._sync?.();
        if (hadFocus) (next?.querySelector("select,input,textarea,button") || fallback)?.focus({ preventScroll: true });
      };
      const addFilter = gridButton(this.labels.gridAddFilter, () => {
        const row = addPredicate(null); if (row) row._filter.column.focus();
      });
      const addPredicate = predicate => {
        if (form.querySelectorAll(".cx-grid-filter").length >= 64) {
          setText(error, this.labels.gridInvalidFilter); return null;
        }
        this.addGridFilter(rows, predicate); const row = rows.lastElementChild;
        row.lastElementChild.addEventListener("click", event => {
          event.preventDefault(); event.stopImmediatePropagation(); focusAfterRemove(rows, row, addFilter);
        }, { capture: true }); return row;
      };
      const addChild = gridButton(this.labels.gridAddFilterGroup, () => {
        const child = this.addReportingFilterGroup(children, null, depth + 1, form, error);
        if (child) child._group.operator.focus();
      });
      addChild.disabled = depth === 8;
      const remove = gridButton(this.labels.gridDeleteFilterGroup, () => {
        const fallback = parent.closest(".cx-grid-filter-group")?.querySelector(":scope > .cx-grid-filter-group-actions > button") ||
          parent.nextElementSibling;
        focusAfterRemove(parent, group, fallback);
      });
      actions.append(addFilter, addChild, remove);
      const predicates = definition ? definition.operator === "and" ? reportingRangeRows(definition.filters) : definition.filters : [];
      predicates.forEach(addPredicate);
      (definition?.groups || []).forEach(child => this.addReportingFilterGroup(children, child, depth + 1, form, error));
      parent._sync?.(); return group;
    },

    readReportingFilterGroups(roots) {
      if (!roots.children.length) return undefined;
      const read = element => {
        const { operator, rows, children } = element._group;
        const group = { operator: operator.value, filters: [], groups: [...children.children].map(read) };
        for (const row of rows.children) {
          const filters = [].concat(this.readGridFilter(row));
          // A range remains one conjunction inside OR; flattening its two bounds would match almost every value.
          if (filters.length > 1 && group.operator === "or") group.groups.push({ operator: "and", filters, groups: [] });
          else group.filters.push(...filters);
        }
        return group;
      };
      return read(roots.firstElementChild);
    }
  });
