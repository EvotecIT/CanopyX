  // Declarative column settings stay small; execution and footer rendering load as an optional part.
  const GRID_OPTIONS = {}, GRID_OPTION_GRIDS = new WeakMap();
  const gridClassName = value => typeof value === "string" && value.length <= 512 && /^(?:[A-Za-z_][\w-]*)(?: +[A-Za-z_][\w-]*)*$/.test(value);
  function gridColumnOptions(column, columns) {
    if (column.className != null && !gridClassName(column.className) ||
        column.alignment != null && !["start", "center", "end"].includes(column.alignment) ||
        column.sortComparator != null && (typeof column.sortComparator !== "string" || !/^[a-z][a-zA-Z\d]{0,31}$/.test(column.sortComparator)) ||
        column.orderData !== undefined && (!Array.isArray(column.orderData) || column.orderData.length > 32 ||
          new Set(column.orderData).size !== column.orderData.length || column.orderData.some(id => !columns.some(item => item.id === id))) ||
        column.orderSequence !== undefined && (!Array.isArray(column.orderSequence) || column.orderSequence.length > 3 ||
          new Set(column.orderSequence).size !== column.orderSequence.length || column.orderSequence.some(value => !["asc", "desc", "none"].includes(value))))
      throw new Error("CanopyX: invalid column class, alignment or ordering options.");
  }
  function gridColumnDefaults(view) {
    const rules = view.columnDefaults;
    if (rules === undefined) return view;
    if (!Array.isArray(rules) || rules.length > 64) throw new Error("CanopyX: at most 64 column default rules.");
    const keys = ["className", "alignment", "sortable", "filterable", "hidden", "orderData", "orderSequence", "sortComparator"];
    for (const rule of rules) {
      if (!rule || !Array.isArray(rule.targets) || !rule.targets.length || rule.targets.length > 64 ||
          Object.keys(rule).some(key => key !== "targets" && !keys.includes(key)) ||
          rule.targets.some(target => typeof target !== "string" || !(target[0] === "#" && target.length > 1 || /^(\*|\.[A-Za-z_][\w-]*|index:\d+)$/.test(target)) ||
            target[0] === "#" && !view.columns.some(column => column.id === target.slice(1)) || target.startsWith("index:") && Number(target.slice(6)) >= view.columns.length) ||
          ["sortable", "filterable", "hidden"].some(key => rule[key] !== undefined && typeof rule[key] !== "boolean"))
        throw new Error("CanopyX: invalid column defaults.");
      gridColumnOptions(rule, view.columns);
    }
    const columns = view.columns.map((column, index) => {
      const defaults = {};
      for (const rule of rules) if (rule.targets.some(target => target === "*" || target === "#" + column.id || target === "index:" + index ||
          target[0] === "." && (column.className || "").split(/ +/).includes(target.slice(1))))
        for (const key of keys) if (defaults[key] === undefined && rule[key] != null) defaults[key] = rule[key];
      return { ...defaults, ...column };
    });
    return { ...view, columns };
  }
  function gridOptionsUsed(view, plugins = []) {
    return !!(view.footers?.length || view.columns.some(column => column.orderData || column.sortComparator) ||
      plugins.some(plugin => plugin.filterOperators || plugin.sortComparators));
  }
