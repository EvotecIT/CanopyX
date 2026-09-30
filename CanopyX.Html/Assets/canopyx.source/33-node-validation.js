  // ---------- protocol node semantics before attachment ----------
  /** URL-bound identifiers must be nonempty and contain complete UTF-16 surrogate pairs. */
  function isIdentifier(value) {
    return typeof value === "string" && /^(?:[^\uD800-\uDFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF])+$/.test(value);
  }

  function requireIdentifier(value, name) {
    if (!isIdentifier(value)) {
      throw new Error("CanopyX: " + name + " must be a nonempty, well-formed Unicode identifier");
    }
  }

  function validateNodes(nodes, existing, inlineOnly = false) {
    if (!Array.isArray(nodes)) throw new Error("CanopyX: page items must be an array.");
    const seen = new Set();
    const pending = nodes.slice();
    while (pending.length) {
      const node = pending.pop();
      requireIdentifier(node && node.id, "node ID");
      if (typeof node.label !== "string") throw new Error("CanopyX: node label must be a string.");
      if (Object.prototype.hasOwnProperty.call(node, "flags")) requireFlags(node.flags, "node flags");
      if (Object.prototype.hasOwnProperty.call(node, "data") && (!node.data || typeof node.data !== "object" || Array.isArray(node.data) ||
          Object.keys(node.data).some((name) => !name || name === "__proto__" || typeof node.data[name] !== "string"))) {
        throw new Error("CanopyX: node data must be an object of strings with nonempty names.");
      }
      if (existing.has(node.id) || seen.has(node.id)) throw new Error("CanopyX: duplicate node ID " + node.id);
      seen.add(node.id);
      if (node.ref != null) requireIdentifier(node.ref, "node reference");
      if (Object.prototype.hasOwnProperty.call(node, "children") && !Array.isArray(node.children)) {
        throw new Error("CanopyX: node children must be an array.");
      }
      if (inlineOnly && (node.ref != null || node.childCount != null && !Array.isArray(node.children) ||
          node.hasChildren === true && (!Array.isArray(node.children) || !node.children.length))) {
        throw new Error("CanopyX: inline views cannot declare lazy children.");
      }
      if (node.detail != null && (Object.prototype.hasOwnProperty.call(node, "children") ||
          node.hasChildren === true || node.ref != null || node.childCount != null)) {
        throw new Error("CanopyX: detail row must be a leaf.");
      }
      if (Object.prototype.hasOwnProperty.call(node, "childCount") &&
          (!validStructuralCount(node.childCount) || node.childCount < 1)) {
        throw new Error("CanopyX: node childCount must be a positive 32-bit integer.");
      }
      if (!Array.isArray(node.children) && (node.ref != null || node.childCount != null) && node.hasChildren !== true) {
        throw new Error("CanopyX: lazy node reference or childCount requires hasChildren true.");
      }
      if (Array.isArray(node.children)) {
        if (node.ref != null) throw new Error("CanopyX: inline children cannot have a load reference.");
        if (node.hasChildren === true && !node.children.length) throw new Error("CanopyX: expandable inline children cannot be empty.");
        if (node.hasChildren === false && node.children.length) throw new Error("CanopyX: inline children cannot declare a leaf.");
        if (node.childCount != null && node.childCount !== node.children.length) throw new Error("CanopyX: inline childCount must equal children length.");
        for (const child of node.children) pending.push(child);
      }
    }
  }

  /** Validates the entire incoming page before its wrappers or key map can change. */
  function validatePage(page, existing, expectedOffset) {
    if (!page || !Array.isArray(page.items)) throw new Error("CanopyX: page items must be an array.");
    const items = page.items;
    if (Object.prototype.hasOwnProperty.call(page, "next") && page.next !== null) {
      requireIdentifier(page.next, "page continuation");
    }
    if (page.offset !== undefined && (!Number.isInteger(page.offset) || page.offset !== expectedOffset)) {
      throw new Error("CanopyX: page offset does not match the loaded child count.");
    }
    if (page.total != null && (!validStructuralCount(page.total) || page.total < expectedOffset + items.length)) {
      throw new Error("CanopyX: page total is smaller than its loaded range.");
    }
    if (page.total != null && (page.next != null) !== (expectedOffset + items.length < page.total)) {
      throw new Error("CanopyX: page continuation disagrees with its total.");
    }
    validateNodes(items, existing);
    return items;
  }
