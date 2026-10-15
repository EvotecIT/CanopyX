
  // ---------- sidecar search index (see "Search Index" in docs/data-protocol.md) ----------
  // Entry files hold every node once; word shards list the entry numbers of each folded word. A query intersects the
  // lists of its words, then loads only the entry files of its first matches. The core checks the manifest's index when the
  // manifest loads; the search itself is the search part (canopyx.search.source), loaded on a sidecar source's first query.

  function badIndex(what) {
    return new Error("CanopyX: search " + what + " does not match the manifest or is malformed.");
  }

  function isCount(value) {
    return Number.isInteger(value) && value >= 0;
  }

  /** Checks the manifest's search object; entry files cover the entry numbers from 0 without gaps. */
  function checkSearchIndex(index) {
    if (!index || !isCount(index.entryCount) || !Array.isArray(index.entryFiles) || !Array.isArray(index.kinds) ||
        !index.shards || typeof index.shards !== "object" || (index.entryCount > 0) !== (index.entryFiles.length > 0) ||
        index.kinds.some((kind) => typeof kind !== "string") || index.entryFiles.some((first, i) =>
          !isCount(first) || first >= index.entryCount || (i ? first <= index.entryFiles[i - 1] : first))) {
      throw badIndex("index");
    }
    // A packed index names the first entry file and the first shard key of each of its packs, both in order.
    if (index.entryPacks === undefined && index.shardPacks === undefined) return;
    const keys = Object.keys(index.shards).sort();
    if (!Array.isArray(index.entryPacks) || !Array.isArray(index.shardPacks) ||
        (index.entryFiles.length > 0) !== (index.entryPacks.length > 0) || (keys.length > 0) !== (index.shardPacks.length > 0) ||
        index.entryPacks.some((first, i) => !isCount(first) || first >= index.entryFiles.length || (i ? first <= index.entryPacks[i - 1] : first)) ||
        index.shardPacks.some((key, i) => typeof key !== "string" || !Object.hasOwn(index.shards, key) || (i ? key <= index.shardPacks[i - 1] : key !== keys[0]))) {
      throw badIndex("index packs");
    }
  }

  /** Keeps the most recently used documents only. Failed loads are not kept, so a retry can succeed. */
  function recentCache(limit, loadDoc, maxBytes = Infinity, bytesOf = () => 0) {
    const cache = new Map();
    let bytes = 0;
    const get = (key) => {
      let entry = cache.get(key);
      if (entry) {
        cache.delete(key);
      } else {
        entry = { pending: loadDoc(key), ready: false, bytes: 0 };
        entry.pending.then(doc => {
          if (cache.get(key) !== entry) return;
          entry.ready = true; entry.bytes = bytesOf(doc); bytes += entry.bytes;
          for (const [oldKey, old] of cache) {
            if (cache.size <= limit && bytes <= maxBytes) break;
            if (old.ready) { cache.delete(oldKey); bytes -= old.bytes; }
          }
        }, () => { if (cache.get(key) === entry) cache.delete(key); });
      }
      cache.set(key, entry);
      return entry.pending;
    };
    get.clear = () => { cache.clear(); bytes = 0; };
    return get;
  }

  const packBytes = pages => pages.reduce((bytes, text) => bytes + (typeof text === "string" ? text.length * 2 : 0), 0);

  /**
   * Search over a bundle's index; load(ref) resolves a sidecar document, manifest() the checked manifest. The entries on
   * the paths of the hits a query returns are kept in hints by node id, with where their pages are. Queries without a word,
   * or without a word of two units, settle here; the others load the search part (82-parts.js) once.
   */
  function sidecarSearch(load, manifest, hints) {
    let search;
    return (query, limit) => {
      const queryWords = words(query);
      if (!queryWords.length) {
        return Promise.resolve({ hits: [], total: 0, truncated: false });
      }
      if (!queryWords.some((word) => word.length >= 2)) {
        const error = new Error("CanopyX: sidecar search needs a word of at least two UTF-16 units.");
        error.code = "too-short";
        return Promise.reject(error);
      }
      return loadPart(SEARCH_PART).then(() => (search ||= SEARCH_IMPL.create(load, manifest, hints))(query, queryWords, limit));
    };
  }