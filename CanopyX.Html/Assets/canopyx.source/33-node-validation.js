  // ---------- protocol node semantics before attachment ----------
  function validateNodes(nodes, existing) {
    if (!Array.isArray(nodes)) throw new Error("CanopyX: page items must be an array.");
    const seen = new Set();
    const pending = nodes.slice();
    while (pending.length) {
      const node = pending.pop();
      requireIdentifier(node && node.id, "node ID");
      if (existing.has(node.id) || seen.has(node.id)) throw new Error("CanopyX: duplicate node ID " + node.id);
      seen.add(node.id);
      if (node.ref != null) requireIdentifier(node.ref, "node reference");
      if (Array.isArray(node.children)) {
        if (node.ref != null) throw new Error("CanopyX: inline children cannot have a load reference.");
        if (node.hasChildren === false && node.children.length) throw new Error("CanopyX: inline children cannot declare a leaf.");
        if (node.childCount != null && node.childCount !== node.children.length) throw new Error("CanopyX: inline childCount must equal children length.");
        for (const child of node.children) pending.push(child);
      }
    }
  }

  /** Validates the entire incoming page before its wrappers or key map can change. */
  function validatePage(page, existing, expectedOffset) {
    const items = page.items || [];
    if (page.offset !== undefined && (!Number.isInteger(page.offset) || page.offset !== expectedOffset)) {
      throw new Error("CanopyX: page offset does not match the loaded child count.");
    }
    if (page.total != null && (!Number.isInteger(page.total) || page.total < expectedOffset + items.length)) {
      throw new Error("CanopyX: page total is smaller than its loaded range.");
    }
    validateNodes(items, existing);
    return items;
  }
