
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

  /** Orders hits as the protocol ranks them. Each label is folded once, not once per comparison. */
  function rankHits(hits, query, limit) {
    const folded = trimSeparators(foldText(query));
    const ranked = hits.map((hit) => ({ hit: hit, rank: rankLabel(hit.label, folded) }));
    ranked.sort((a, b) => a.rank - b.rank || collator.compare(a.hit.label, b.hit.label));
    return { hits: ranked.slice(0, limit).map((item) => item.hit), total: hits.length, truncated: hits.length > limit };
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
              const hit = { path: path.reverse(), label: item.node.label, context: labels.reverse().join(" / ") };
              if (item.node.kind != null) hit.kind = item.node.kind;
              hits.push(hit);
            }
            const children = item.node.children || [];
            for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i], parent: item });
          }
        }
        return Promise.resolve(rankHits(hits, query, limit));
      }
    };
  }

  function sidecarSource(view) {
    const supplied = view.source.base;
    if (typeof supplied !== "string" || !supplied || /[?#]/.test(supplied)) throw new Error("CanopyX: sidecar base must be a folder path without a query or fragment.");
    const base = supplied.endsWith("/") ? supplied : supplied + "/";
    const load = (ref) => loadSidecar(base, view.id, ref);
    let manifestPromise = null;
    // Failed loads are not cached, so a retry can succeed once the file is back.
    const manifest = () => manifestPromise || (manifestPromise = load("manifest").then((doc) => {
      checkDocument(doc, "manifest");
      if (doc.view !== view.id) throw new Error("CanopyX: manifest view does not match the requested view.");
      if (doc.search !== undefined) checkSearchIndex(doc.search);
      if (doc.packs !== undefined && !isCount(doc.packs)) throw new Error("CanopyX: manifest packs must be a count.");
      return doc;
    }).catch((err) => {
      manifestPromise = null;
      throw err;
    }));
    // A pack file holds the children pages of many nodes as JSON text, and only the page a node asks for is parsed.
    // The pages of a subtree sit next to each other, so the last few packs stay loaded.
    const loadPack = recentCache(PACK_CACHE, async (number) => {
      const doc = checkDocument(await load("p/" + number), "pack");
      if (!Array.isArray(doc.pages)) throw new Error("CanopyX: pack pages must be an array.");
      return doc.pages;
    });
    const loadPage = async (ref) => {
      const packed = /^p\/(0|[1-9]\d*)#(0|[1-9]\d*)$/.exec(ref);
      const packs = packed ? (await manifest()).packs : undefined;
      if (packs === undefined) return load(ref);
      const text = Number(packed[1]) < packs ? (await loadPack(packed[1]))[Number(packed[2])] : undefined;
      if (typeof text !== "string") throw new Error("CanopyX: the bundle has no packed page " + ref + ".");
      return JSON.parse(text);
    };
    return {
      kind: "sidecar",
      canSearch: true,
      manifest: manifest,
      async page(node, cursor) {
        const ref = cursor || (node ? node.ref || node.id : (await manifest()).root);
        if (!ref) {
          throw new Error("Node '" + node.id + "' has no sidecar reference for its children.");
        }
        const doc = checkPage(await loadPage(ref), node);
        return { items: doc.items, total: doc.total, next: doc.next || null, offset: doc.offset || 0 };
      },
      search: sidecarSearch(load, manifest)
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
        return { items: doc.items, total: doc.total, next: doc.next || null, offset: doc.offset || 0 };
      },
      async search(query, limit) {
        if (!source.search) {
          return { hits: [], total: 0, truncated: false };
        }
        const doc = await getJson(fill(source.search, { query: encodeURIComponent(query), limit: String(limit) }), "search");
        if (doc.query !== query) throw new Error("CanopyX: search response query does not match the request.");
        if (doc.total != null && (doc.total < doc.hits.length || doc.truncated !== (doc.total > doc.hits.length))) {
          throw new Error("CanopyX: search total and truncated flag disagree with the returned hits.");
        }
        return { hits: doc.hits, total: doc.total, truncated: doc.truncated };
      },
      counts: source.counts ? async (ids) => {
        const items = [];
        for (let i = 0; i < ids.length; i += COUNTS_BATCH) {
          // The host's normal query parser decodes once; retain encoded components for its split-then-decode step.
          const batch = ids.slice(i, i + COUNTS_BATCH).map((id) => encodeURIComponent(encodeURIComponent(id))).join(",");
          const doc = await getJson(fill(source.counts, { ids: batch }), "counts");
          items.push.apply(items, doc.items);
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
    if (kind === "inline") {
      if (!Array.isArray(view.roots)) throw new Error("CanopyX: inline view roots must be an array.");
      return inlineSource(view);
    }
    throw new Error("CanopyX: unknown source kind '" + kind + "'.");
  }
