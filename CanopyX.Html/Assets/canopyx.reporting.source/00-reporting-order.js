  // ---------- deterministic reporting text order, shared with CanopyGridOrdering ----------
  function reportingTextOrder(policy) {
    if (!policy || typeof policy !== "object" || Array.isArray(policy) ||
        Object.keys(policy).some(key => !["text", "categories"].includes(key)) ||
        !["ordinal", "foldedOrdinal", "natural", "foldedNatural"].includes(policy.text) ||
        policy.categories !== undefined && (!Array.isArray(policy.categories) || policy.categories.length > 512 ||
          policy.categories.some(value => typeof value !== "string" || value.length > 4096)))
      throw new Error("CanopyX: invalid reporting text order.");
    const fold = policy.text.startsWith("folded"), natural = policy.text === "natural" || policy.text === "foldedNatural";
    const key = value => fold ? foldText(value) : value, categories = new Map();
    for (const value of policy.categories || []) {
      const canonical = key(value);
      if (categories.has(canonical)) throw new Error("CanopyX: repeated category after case folding.");
      categories.set(canonical, categories.size);
    }
    const digit = code => code >= 48 && code <= 57;
    return (left, right) => {
      const a = key(left), b = key(right);
      if (categories.size) {
        const ai = categories.get(a) ?? categories.size, bi = categories.get(b) ?? categories.size;
        if (ai !== bi) return gridOrder(ai, bi);
      }
      if (!natural) return gridOrder(a, b);
      let i = 0, j = 0;
      while (i < a.length && j < b.length) {
        if (digit(a.charCodeAt(i)) && digit(b.charCodeAt(j))) {
          let endA = i, endB = j;
          while (endA < a.length && digit(a.charCodeAt(endA))) endA++;
          while (endB < b.length && digit(b.charCodeAt(endB))) endB++;
          while (i + 1 < endA && a[i] === "0") i++;
          while (j + 1 < endB && b[j] === "0") j++;
          const length = gridOrder(endA - i, endB - j);
          if (length) return length;
          while (i < endA) {
            const compared = gridOrder(a.charCodeAt(i++), b.charCodeAt(j++));
            if (compared) return compared;
          }
          i = endA; j = endB;
        } else {
          const compared = gridOrder(a.charCodeAt(i++), b.charCodeAt(j++));
          if (compared) return compared;
        }
      }
      return gridOrder(a.length - i, b.length - j);
    };
  }

  GRID_REPORTING.validate = view => {
    const options = view.reporting;
    if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key => !["ordering", "headerFilters", "filterGroups", "presenters", "layout", "columnReorder", "responsive", "minimumCenterWidth"].includes(key)) ||
        ["headerFilters", "filterGroups"].some(key => options[key] !== undefined && typeof options[key] !== "boolean"))
      throw new Error("CanopyX: invalid reporting options.");
    if (options.ordering === undefined) return;
    if (!options.ordering || typeof options.ordering !== "object" || Array.isArray(options.ordering))
      throw new Error("CanopyX: reporting ordering is keyed by column identity.");
    for (const [id, policy] of Object.entries(options.ordering)) {
      const column = view.columns.find(item => item && item.id === id);
      if (!column || column.kind !== "text" || !column.sortable) throw new Error("CanopyX: ordering needs a sortable text column.");
      reportingTextOrder(policy);
    }
  };

  GRID_REPORTING.compare = view => {
    const policies = new Map(Object.entries(view.reporting && view.reporting.ordering || {}).map(([id, policy]) => [id, reportingTextOrder(policy)]));
    if (!policies.size) return gridCompare;
    return (left, right, column, direction) => {
      const compare = policies.get(column.id);
      if (!compare) return gridCompare(left, right, column, direction);
      const a = gridScalar(left.cells[column.id], column), b = gridScalar(right.cells[column.id], column);
      if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
      const result = compare(String(a), String(b));
      return direction === "desc" ? -result : result;
    };
  };
