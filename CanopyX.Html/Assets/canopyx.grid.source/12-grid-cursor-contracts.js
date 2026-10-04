  // ---------- opaque host traversal, without changing the known-count offset documents ----------
  function gridCursor(cursor) {
    requireIdentifier(cursor, "grid cursor");
    if (cursor.length > 4096) throw new Error("CanopyX: cursor exceeds 4096 code units.");
  }

  function validateGridCursorPage(page, view, query, accepted) {
    checkDocument(page, "gridCursorPage"); requireIdentifier(page.revision, "grid revision");
    if (page.view !== view.id || !validStructuralCount(page.offset) ||
        page.total !== null && !validStructuralCount(page.total) || page.matched !== null && !validStructuralCount(page.matched) ||
        !Array.isArray(page.items) || page.items.length > query.limit) throw new Error("CanopyX: invalid cursor page.");
    const end = page.offset + page.items.length, next = page.nextCursor !== undefined, previous = page.previousCursor !== undefined;
    if (!validStructuralCount(end) || page.total !== null && end > page.total || page.matched !== null && end > page.matched ||
        page.total !== null && page.matched !== null && page.matched > page.total ||
        !page.items.length && (page.offset !== 0 || next) || !page.offset && previous ||
        page.matched !== null && next !== (end < page.matched) || page.total !== null && next && end >= page.total ||
        query.cursor === undefined && page.offset !== 0) throw new Error("CanopyX: inconsistent cursor page.");
    const tokens = [page.nextCursor, page.previousCursor].filter(token => token !== undefined);
    tokens.forEach(gridCursor);
    if (new Set(tokens).size !== tokens.length || tokens.includes(query.cursor)) throw new Error("CanopyX: repeated cursor.");
    return checkedGridPage(page, view, query, accepted);
  }
