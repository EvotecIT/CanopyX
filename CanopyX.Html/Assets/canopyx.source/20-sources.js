
  // ---------- data sources ----------
  // Every source has the same promise-based interface:
  //   page(node, cursor)   -> { items, total, next, offset }   node is null for the top level, cursor null for page one
  //   search(query, limit) -> { hits, total, truncated }
  //   counts(ids)          -> a counts document (remote sources with a counts URL only)
  //   canSearch            -> whether search() can answer
  //   prefetch(opens, finds) -> optional: before a path opens, loads at once what page() will be asked for: the first
  //                           children page of each id in opens, and the page that holds each id in finds; never rejects

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
        // With kinds on the view's search, only nodes of those kinds are found; the others are still walked.
        const kinds = view.search && Array.isArray(view.search.kinds) && view.search.kinds.length ? view.search.kinds : null;
        if (queryWords.length) {
          // Paths are linked during traversal and materialized only for matching hits.
          const stack = (view.roots || []).map((node) => ({ node, parent: null })).reverse();
          while (stack.length) {
            const item = stack.pop();
            if ((!kinds || kinds.indexOf(item.node.kind) >= 0) && matchesWords(wordsOf(item.node), queryWords)) {
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
      if (!Array.isArray(doc.pages) || doc.pages.some(text => typeof text !== "string")) throw new Error("CanopyX: pack pages must be an array of strings.");
      return doc.pages;
    }, PACK_CACHE_BYTES, packBytes);
    // Independent navigation leases retain prefetched files until their owning path settles.
    const pinned = new Map();
    let releaseLoose;
    const packOf = async (ref) => {
      const packed = /^p\/(0|[1-9]\d*)#(0|[1-9]\d*)$/.exec(ref);
      return packed && (await manifest()).packs !== undefined ? packed : null;
    };
    const loadPage = async (ref) => {
      const packed = await packOf(ref);
      if (!packed) {
        // A prefetched file of its own holds one page document, which is used once.
        const entry = pinned.get("file:" + ref);
        return entry ? entry.pending : load(ref);
      }
      const entry = pinned.get("pack:" + packed[1]);
      const text = Number(packed[1]) < (await manifest()).packs ? (await (entry ? entry.pending : loadPack(packed[1])))[Number(packed[2])] : undefined;
      if (typeof text !== "string") throw new Error("CanopyX: the bundle has no packed page " + ref + ".");
      return JSON.parse(text);
    };
    // The entries on the paths of the last query's hits, by node id: where their pages are (see "Search Index").
    const hints = new Map();
    return {
      kind: "sidecar",
      canSearch: true,
      manifest: manifest,
      /**
       * Loads at once the files a path will read: the first children page of each node in opens, and the page that
       * holds each node in finds, as far as the last search told where they are. Never rejects; what fails here fails
       * again, and is reported, when the path reads it.
       */
      async prefetch(opens, finds, request) {
        const held = new Set(), signal = request && request.signal;
        let live = true;
        const release = () => {
          if (!live) return;
          live = false;
          if (signal) signal.removeEventListener("abort", release);
          for (const entry of held) if (!--entry.users && pinned.get(entry.key) === entry) pinned.delete(entry.key);
          held.clear();
        };
        if (signal) {
          if (signal.aborted) { release(); return release; }
          signal.addEventListener("abort", release, { once: true });
        } else {
          if (releaseLoose) releaseLoose();
          releaseLoose = release;
        }
        const refs = new Set();
        opens.forEach((id) => { const hint = hints.get(id); if (hint && hint.ref) refs.add(hint.ref); });
        finds.forEach((id) => { const hint = hints.get(id); if (hint && hint.at) refs.add(hint.at); });
        await Promise.all(Array.from(refs, async (ref) => {
          const packed = await packOf(ref);
          if (!live) return;
          const key = packed ? "pack:" + packed[1] : "file:" + ref;
          let entry = pinned.get(key);
          if (!entry) {
            entry = { key, users: 0, pending: packed ? loadPack(packed[1]) : load(ref) };
            pinned.set(key, entry);
            entry.pending.catch(() => { if (pinned.get(key) === entry) pinned.delete(key); });
          }
          if (!held.has(entry)) { held.add(entry); entry.users++; }
          await entry.pending;
        }).map((pending) => pending.catch(() => {})));
        return release;
      },
      async page(node, cursor) {
        const ref = cursor || (node ? node.ref || node.id : (await manifest()).root);
        if (!ref) {
          throw new Error("Node '" + node.id + "' has no sidecar reference for its children.");
        }
        const doc = checkPage(await loadPage(ref), node);
        return { items: doc.items, total: doc.total, next: doc.next || null, offset: doc.offset || 0 };
      },
      search: sidecarSearch(load, manifest, hints)
    };
  }

  /** Remote requests have a bounded lifetime; options are { timeoutMs?: number, signal?: AbortSignal }. */
  function remoteSource(view, options) {
    const source = view.source;
    if (source.queryAware !== undefined && typeof source.queryAware !== "boolean") throw new Error("CanopyX: queryAware must be a boolean.");
    if (source.queryAware) for (const name of ["children", "search", "counts"]) {
      if (source[name] != null && !/^[^#]*\{viewQuery\}/.test(source[name])) throw new Error("CanopyX: query-aware " + name + " needs {viewQuery} before its fragment.");
    }
    const settings = options || {};
    const timeoutMs = settings.timeoutMs === undefined ? 30000 : settings.timeoutMs;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
      throw new Error("CanopyX: request timeout must be an integer from 1 to 2147483647 milliseconds.");
    }
    const fill = (template, values) => template.replace(/\{(\w+)\}/g, (match, name) => (Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match));
    const getJson = (url, type, request) => remoteJson(url, type, timeoutMs, settings.signal, request && request.signal);
    const queryValues = request => {
      if (!source.queryAware) return {};
      if (!request || !request.query || request.query.version !== 1) throw new Error("CanopyX: a query-aware request needs a view query.");
      return { viewQuery: encodeURIComponent(JSON.stringify(request.query)), revision: encodeURIComponent(request.revision || "") };
    };
    return {
      kind: "remote",
      queryAware: source.queryAware === true,
      canSearch: !!source.search,
      async page(node, cursor, request) {
        const doc = checkPage(await getJson(fill(source.children, Object.assign(queryValues(request), {
          ref: node ? encodeURIComponent(node.ref || node.id) : "",
          cursor: cursor ? encodeURIComponent(cursor) : ""
        })), "page", request), node);
        return { items: doc.items, total: doc.total, next: doc.next || null, offset: doc.offset || 0, revision: doc.revision };
      },
      async search(query, limit, request) {
        if (!source.search) {
          return { hits: [], total: 0, truncated: false, revision: request && request.revision };
        }
        const doc = await getJson(fill(source.search, Object.assign(queryValues(request), { query: encodeURIComponent(query), limit: String(limit) })), "search", request);
        if (doc.query !== query) throw new Error("CanopyX: search response query does not match the request.");
        if (doc.total != null && (doc.total < doc.hits.length || doc.truncated !== (doc.total > doc.hits.length))) {
          throw new Error("CanopyX: search total and truncated flag disagree with the returned hits.");
        }
        return { hits: doc.hits, total: doc.total, truncated: doc.truncated, revision: doc.revision };
      },
      counts: source.counts ? async (ids, request) => {
        const items = [];
        let revision = request && request.revision;
        for (let i = 0; i < ids.length; i += COUNTS_BATCH) {
          // The host's normal query parser decodes once; retain encoded components for its split-then-decode step.
          const batch = ids.slice(i, i + COUNTS_BATCH).map((id) => encodeURIComponent(encodeURIComponent(id))).join(",");
          const doc = await getJson(fill(source.counts, Object.assign(queryValues(request), { ids: batch })), "counts", request);
          if (source.queryAware) revision = snapshotRevision(doc, revision);
          items.push.apply(items, doc.items);
        }
        return Object.assign({ protocol: PROTOCOL, type: "counts", items: items }, source.queryAware ? { revision } : {});
      } : null
    };
  }

  function sourceFor(view, options) {
    const kind = view.source && view.source.kind;
    if (kind === "sidecar") {
      return sidecarSource(view);
    }
    if (kind === "remote") {
      return remoteSource(view, options);
    }
    if (kind === "inline") {
      if (!Array.isArray(view.roots)) throw new Error("CanopyX: inline view roots must be an array.");
      return inlineSource(view);
    }
    throw new Error("CanopyX: unknown source kind '" + kind + "'.");
  }
