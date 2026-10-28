  // Column slots keep their native cells and keyboard order; only their displayed text is templated by the layouts part.
  function readCardTemplate(value, columns, layout) {
    if (value === undefined) return;
    const ids = new Set(columns.map(column => column.id));
    if (!layout?.modes.includes("cards") || !value || typeof value !== "object" || Array.isArray(value) ||
        !Object.keys(value).length || Object.keys(value).length > 64) throw new Error("CanopyX: cardTemplate needs a card layout and 1 to 64 column slots.");
    for (const [id, template] of Object.entries(value)) {
      if (!ids.has(id) || typeof template !== "string" || template.length > 2048) throw new Error("CanopyX: invalid card template slot.");
      const literal = template.replace(/\{([^{}]+)\}/g, (_, column) => {
        if (!ids.has(column)) throw new Error("CanopyX: card template tokens name declared columns.");
        return "";
      });
      if (/[{}]/.test(literal)) throw new Error("CanopyX: unmatched card template token.");
    }
  }
