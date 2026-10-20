  // ---------- matrix: the state, the API and the implementation createMatrix uses (MATRIX_IMPL.create) ----------
  // The state is the reader's query: search, filters by attribute value, only problems, hide empty, the sort and the grouping of each
  // axis and the collapsed groups. It is plain data, raised as canopyx:matrixState and accepted back by setState.
  function matrixAxisName(axis) { if (!MATRIX_AXES.includes(axis)) throw new Error("CanopyX: a matrix axis is \"rows\" or \"columns\"."); return axis; }
  Object.assign(MatrixView.prototype, {
    axisData(axis) { return matrixAxisName(axis) === "rows" ? this.doc.rows : this.doc.columns; },
    checkSort(axis, sort) {
      if (sort == null) return null;
      if (typeof sort !== "object" || (sort.by !== "#label" && sort.by !== "#total" && !this.axisData(axis).attributeById.has(sort.by)) || !["asc", "desc"].includes(sort.direction))
        throw new Error("CanopyX: a matrix sort is { by: \"#label\" | \"#total\" | an attribute, direction: \"asc\" | \"desc\" }.");
      return { by: sort.by, direction: sort.direction };
    },
    checkFilters(axis, filters) {
      const data = this.axisData(axis), result = {};
      if (filters == null) return result;
      if (typeof filters !== "object" || Array.isArray(filters)) throw new Error("CanopyX: matrix filters are values by attribute id.");
      for (const [id, values] of Object.entries(filters)) {
        if (!data.attributeById.has(id) || values !== null && (!Array.isArray(values) || values.length > 200 || values.some(value => typeof value !== "string"))) throw new Error("CanopyX: invalid matrix filter on '" + id + "'.");
        if (values && values.length) result[id] = [...new Set(values)];
      }
      return result;
    },
    applyState(state, derive = true) {
      if (!state || typeof state !== "object") throw new Error("CanopyX: a matrix state is an object.");
      const query = this.query, next = { ...query, filters: { ...query.filters }, sort: { ...query.sort }, group: { ...query.group }, collapsed: { rows: [...query.collapsed.rows], columns: [...query.collapsed.columns] } };
      if (state.search !== undefined) { if (typeof state.search !== "string" || state.search.length > 256) throw new Error("CanopyX: a matrix search is text of at most 256 characters."); next.search = state.search; }
      if (state.attentionOnly !== undefined) next.attentionOnly = !!state.attentionOnly;
      if (state.hideEmpty !== undefined) next.hideEmpty = !!state.hideEmpty;
      for (const axis of MATRIX_AXES) {
        if (state.filters && state.filters[axis] !== undefined) next.filters[axis] = this.checkFilters(axis, state.filters[axis]);
        if (state.sort && state.sort[axis] !== undefined) next.sort[axis] = this.checkSort(axis, state.sort[axis]);
        if (state.group && state.group[axis] !== undefined) {
          const group = state.group[axis];
          if (group !== null && !this.axisData(axis).attributeById.has(group)) throw new Error("CanopyX: a matrix groups by one of its attributes.");
          if (group !== next.group[axis]) next.collapsed[axis] = [];
          next.group[axis] = group;
        }
        if (state.collapsed && state.collapsed[axis] !== undefined) {
          if (!Array.isArray(state.collapsed[axis]) || state.collapsed[axis].some(key => typeof key !== "string")) throw new Error("CanopyX: collapsed groups are a list of group keys.");
          next.collapsed[axis] = [...new Set(state.collapsed[axis])];
        }
      }
      this.query = next;
      if (derive) { this.derive(true); this.stateChanged(); }
    },
    setQuery(partial) { this.applyState(partial); },
    sort(axis, by, direction = "asc") { this.applyState({ sort: { [matrixAxisName(axis)]: by == null ? null : { by, direction } } }); },
    group(axis, attribute) { this.applyState({ group: { [matrixAxisName(axis)]: attribute ?? null } }); },
    filter(axis, attribute, values) { this.applyState({ filters: { [matrixAxisName(axis)]: { ...this.query.filters[axis], [attribute]: values ?? null } } }); },
    getState() {
      const query = this.query, copy = value => JSON.parse(JSON.stringify(value));
      return gridFreeze({ search: query.search, attentionOnly: query.attentionOnly, hideEmpty: query.hideEmpty, filters: copy(query.filters), sort: copy(query.sort), group: copy(query.group), collapsed: copy(query.collapsed) });
    },
    stateChanged() { this.emit("matrixState", this.getState(), "onStateChange"); },
    getVisible() {
      const ids = entries => entries.filter(entry => entry.kind !== "heading").flatMap(entry => entry.members.map(item => item.id));
      return gridFreeze({ rows: ids(this.model.rows), columns: ids(this.model.columns) });
    },
    focusCell(row, column) {
      const r = this.model.rows.findIndex(entry => entry.kind !== "heading" && entry.members.some(item => item.id === row));
      const c = this.model.columns.findIndex(entry => entry.members.some(item => item.id === column));
      if (r < 0 || c < 0) return false;
      this.moveTo(r, c);
      return true;
    },
    update(view) {
      const doc = matrixDocument(view), state = this.getState();
      this.doc = doc; this.labels = matrixLabels(doc.labels, this.options.labels); this.model = new MatrixModel(doc, this.format);
      this.query = this.model.initialQuery();
      // Keep what still applies: filters, sorts and groups of attributes the new document declares.
      try { this.applyState(state, false); } catch (error) { this.query = this.model.initialQuery(); }
      this.root.className = "cx-matrix cx-mx-" + doc.density; this.source = view;
      this.closePanel(false); this.refreshChrome(); this.geometry = undefined;
      this.derive(false);
    }
  });

  function matrixCreate(host, options) {
    const view = new MatrixView(host, options);
    const impl = {
      ready: Promise.resolve().then(() => { if (view.destroyed) return impl; host.setAttribute("data-cx-ready", ""); view.emit("matrixReady", { matrix: view.doc.id }, "onReady"); return impl; }),
      document: () => view.source || view.options.view,
      sort: (axis, by, direction) => view.sort(axis, by, direction), group: (axis, attribute) => view.group(axis, attribute),
      filter: (axis, attribute, values) => view.filter(axis, attribute, values), setSearch: text => view.setQuery({ search: text }),
      setAttentionOnly: on => view.setQuery({ attentionOnly: !!on }), getState: () => view.getState(), setState: state => view.applyState(state),
      getVisible: () => view.getVisible(), focusCell: (row, column) => view.focusCell(row, column), update: next => view.update(next),
      destroy: () => {
        if (view.destroyed) return;
        view.destroyed = true; view.lifetime.abort(); view.resize?.disconnect(); view.themeWatch?.disconnect();
        cancelAnimationFrame(view.frame); cancelAnimationFrame(view.fitFrame); clearTimeout(view.searchTimer); clearTimeout(view.tipTimer);
        view.root.remove(); host.removeAttribute("data-cx-ready");
        // The host is as it was before createMatrix: its classes, mount mark, the theme the matrix added and its own max-height.
        host.classList.remove("cx-matrix-host"); if (view.addedTheme) host.removeAttribute("data-cx-theme");
        if (view.fitInline !== undefined) { host.style.maxHeight = view.fitInline; if (!host.getAttribute("style")) host.removeAttribute("style"); }
      }
    };
    return impl;
  }
