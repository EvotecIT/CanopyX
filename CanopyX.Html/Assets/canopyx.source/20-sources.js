
  // ---------- data sources ----------
  // Every source has the same promise-based interface:
  //   page(node, cursor)   -> { items, total, next, offset }   node is null for the top level, cursor null for page one
  //   search(query, limit) -> { hits, total, truncated }
  //   counts(ids)          -> a counts document (remote sources with a counts URL only)
  //   canSearch            -> whether search() can answer

  /** Pages an array that is already in memory (inline roots and inline children). */
  function slicePage(all, cursor, pageSize) {
    const offset = cursor ? Number(cursor) || 0 : 0;
    const items = all.slice(offset, offset + pageSize);
    const end = offset + items.length;
    return { items: items, total: all.length, next: end < all.length ? String(end) : null, offset: offset };
  }

  function rankHits(hits, query, limit) {
    hits.sort((a, b) => rankLabel(a.label, query) - rankLabel(b.label, query) || collator.compare(a.label, b.label));
    return { hits: hits.slice(0, limit), total: hits.length, truncated: hits.length > limit };
  }

  function inlineSource(view) {
    const pageSize = view.pageSize || 100;
    const labelWords = new WeakMap();
    const wordsOf = (node) => {
      let cached = labelWords.get(node);
      if (!cached) {
        cached = words(node.label);
        labelWords.set(node, cached);
      }
      return cached;
    };
    return {
      kind: "inline",
      canSearch: true,
      page(node, cursor) {
        return Promise.resolve(slicePage(node ? node.children || [] : view.roots || [], cursor, pageSize));
      },
      search(query, limit) {
        const queryWords = words(query);
        const hits = [];
        if (queryWords.length) {
          // Paths are linked during traversal and materialized only for matching hits.
          const stack = (view.roots || []).map((node) => ({ node, parent: null })).reverse();
          while (stack.length) {
            const item = stack.pop();
            if (matchesWords(wordsOf(item.node), queryWords)) {
              const path = [];
              const labels = [];
              for (let entry = item; entry; entry = entry.parent) {
                path.push(entry.node.id);
                if (entry !== item) labels.push(entry.node.label);
              }
              hits.push({ path: path.reverse(), label: item.node.label, kind: item.node.kind, context: labels.reverse().join(" / ") });
            }
            const children = item.node.children || [];
            for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i], parent: item });
          }
        }
        return Promise.resolve(rankHits(hits, query, limit));
      }
    };
  }

  /** Picks the search shards for one folded query word (see "Sidecar" in docs/data-protocol.md). */
  function resolveShards(shards, keys, word) {
    const bases = keys.filter((key) => !/\.\d+$/.test(key));
    const parts = (selected) => selected.flatMap((key) => [key].concat(keys.filter((part) => part.startsWith(key + "."))
      .sort((a, b) => Number(a.slice(a.lastIndexOf(".") + 1)) - Number(b.slice(b.lastIndexOf(".") + 1)))));
    for (let length = 2; length <= word.length; length++) {
      const key = shardKey(word.slice(0, length));
      if (Object.prototype.hasOwnProperty.call(shards, key)) return parts([key]);
      const deeper = bases.filter((k) => k.length > key.length && k.startsWith(key));
      if (!deeper.length) return [];
      if (length === word.length) return parts(deeper);
    }
    return [];
  }

  function sidecarSource(view) {
    const supplied = view.source.base;
    if (typeof supplied !== "string" || !supplied || /[?#]/.test(supplied)) throw new Error("CanopyX: sidecar base must be a folder path without a query or fragment.");
    const base = supplied.endsWith("/") ? supplied : supplied + "/";
    const load = (ref) => loadSidecar(base, view.id, ref);
    const shardCache = new Map();
    let manifestPromise = null;
    // Failed loads are not cached, so a retry can succeed once the file is back.
    const manifest = () => manifestPromise || (manifestPromise = load("manifest").then((doc) => {
      checkDocument(doc, "manifest");
      if (doc.view !== view.id) throw new Error("CanopyX: manifest view does not match the requested view.");
      return doc;
    }).catch((err) => {
      manifestPromise = null;
      throw err;
    }));
    const loadShard = (key) => {
      if (!shardCache.has(key)) {
        shardCache.set(key, load("s/" + key).then((doc) => {
          checkDocument(doc, "searchShard");
          return doc.entries.map((entry) => ({ entry: entry, words: words(entry.label) }));
        }).catch((err) => {
          shardCache.delete(key);
          throw err;
        }));
      }
      return shardCache.get(key);
    };
    return {
      kind: "sidecar",
      canSearch: true,
      manifest: manifest,
      async page(node, cursor) {
        const ref = cursor || (node ? node.ref : (await manifest()).root);
        if (!ref) {
          throw new Error("Node '" + node.id + "' has no sidecar reference for its children.");
        }
        const doc = checkPage(await load(ref), node);
        return { items: doc.items || [], total: doc.total, next: doc.next || null, offset: doc.offset || 0 };
      },
      async search(query, limit) {
        const queryWords = words(query);
        if (queryWords.length && !queryWords.some((word) => word.length >= 2)) {
          throw new Error("CanopyX: sidecar search needs a word of at least two UTF-16 units.");
        }
        const m = await manifest();
        if (!m.search || !queryWords.length) {
          return { hits: [], total: 0, truncated: false };
        }
        const longest = queryWords.reduce((a, b) => (b.length > a.length ? b : a));
        const shards = m.search.shards;
        const keys = resolveShards(shards, Object.keys(shards), longest);
        const loaded = await Promise.all(keys.map(loadShard));
        const seen = new Set();
        const hits = [];
        for (const shard of loaded) {
          for (const item of shard) {
              const pathKey = JSON.stringify(item.entry.path);
            if (!seen.has(pathKey) && matchesWords(item.words, queryWords)) {
              seen.add(pathKey);
              hits.push(item.entry);
            }
          }
        }
        return rankHits(hits, query, limit);
      }
    };
  }

  function remoteSource(view) {
    const source = view.source;
    const fill = (template, values) => template.replace(/\{(\w+)\}/g, (match, name) => (Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match));
    const getJson = async (url, type) => {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new Error(response.status + " " + response.statusText);
      }
      return checkDocument(await response.json(), type);
    };
    return {
      kind: "remote",
      canSearch: !!source.search,
      async page(node, cursor) {
        const doc = checkPage(await getJson(fill(source.children, {
          ref: node ? encodeURIComponent(node.ref || node.id) : "",
          cursor: cursor ? encodeURIComponent(cursor) : ""
        }), "page"), node);
        return { items: doc.items || [], total: doc.total, next: doc.next || null, offset: doc.offset || 0 };
      },
      async search(query, limit) {
        if (!source.search) {
          return { hits: [], total: 0, truncated: false };
        }
        const doc = await getJson(fill(source.search, { query: encodeURIComponent(query), limit: String(limit) }), "search");
        if (doc.query !== query) throw new Error("CanopyX: search response query does not match the request.");
        return { hits: doc.hits || [], total: doc.total, truncated: !!doc.truncated };
      },
      counts: source.counts ? async (ids) => {
        const items = [];
        for (let i = 0; i < ids.length; i += COUNTS_BATCH) {
          const batch = ids.slice(i, i + COUNTS_BATCH).map(encodeURIComponent).join(",");
          const doc = await getJson(fill(source.counts, { ids: batch }), "counts");
          items.push.apply(items, doc.items || []);
        }
        return { protocol: PROTOCOL, type: "counts", items: items };
      } : null
    };
  }

  function sourceFor(view) {
    const kind = view.source && view.source.kind;
    if (kind === "sidecar") {
      return sidecarSource(view);
    }
    if (kind === "remote") {
      return remoteSource(view);
    }
    return inlineSource(view);
  }
