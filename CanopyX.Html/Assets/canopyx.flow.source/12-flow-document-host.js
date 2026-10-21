  // ---------- flow: the options of a field, and of a records column (docs/flow.md#fields) ----------

  /** Option objects (or bare values) of a field or a records column. */
  function flowOptions(raw, bad) {
    if (raw.length > 1000) bad("needs at most 1000 options");
    const options = raw.map(option => {
      flowKeys(flowIs(option) ? option : { value: option }, ["value", "label", "description", "badge", "disabledReason", "group"], "An option");
      const item = flowIs(option) ? option : { value: option };
      if (!flowScalar(item.value)) bad("has an invalid option value");
      return Object.freeze({ value: item.value, label: flowString(item.label, 200, "An option label") ?? String(item.value), description: flowString(item.description, 1000, "An option description"),
        badge: flowString(item.badge, 40, "An option badge"), disabledReason: flowString(item.disabledReason, 400, "A disabled reason"), group: flowString(item.group, 200, "An option group") });
    });
    if (new Set(options.map(option => option.value)).size !== options.length) bad("needs options with distinct values");
    return options;
  }
