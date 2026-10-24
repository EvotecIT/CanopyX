  // ---------- parts of trees: the definitions the tree view kind loads (82-parts.js loads them) ----------
  // The tree toolbar menus (Columns, Views, Export, more), column fitting and auto height. Trees on every runtime load it.
  const TREE_TOOLS = definePart(TreeGrid, "tree-tools", "tree tools", () => ({ TreeGrid, h, setText, fill, numberFormat, watchFlyout, columnWidth, prepareWidth, cellText, cellValue, isCellObject, foldText, formatting,
    sortKey, compareKeys, EXPORT_FORMATS, exportFormat, exportTimeout, exportFormatsOf: EXPORT_IMPL.formatsOf, INDENT, MAX_PROTOCOL_INTEGER, hostControl, detailCell, HostCellContext, disposeHostSlot, loadPart, definePart, pluginItems,
    applyTone, toneOf, badgeElement, RECORD_IMPL, svgIcon, gridExportField, columnNumericTone, columnValueTone }));
  // A bundle's index search (15-search-index.js), loaded on a sidecar source's first query, also outside a tree.
  const SEARCH_IMPL = {}, SEARCH_PART = definePart(TreeGrid, "search", "sidecar search", () => ({ SEARCH_IMPL, checkDocument, badIndex, isCount, isIdentifier, recentCache, packBytes,
    shardKey, foldText, trimSeparators, rankHits, validateSearchHit, PACK_CACHE, PACK_CACHE_BYTES, SHARD_CACHE, ENTRY_CACHE, ENTRY_BATCH, SEARCH_CANDIDATES }));
  /** Loads a part of this view kind by name, after the tree tools part that defines a tree's export part. */
  async function requirePart(name) {
    await this.toolsReady;
    const part = Object.hasOwn(this.parts, name) ? this.parts[name] : null;
    if (!part) throw new Error("CanopyX: unknown part '" + name + "'.");
    return loadPart(part);
  }
  TreeGrid.prototype.requirePart = requirePart;
