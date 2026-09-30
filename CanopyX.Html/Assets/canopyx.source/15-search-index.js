
  // ---------- sidecar search index (see "Search Index" in docs/data-protocol.md) ----------
  // Entry files hold every node once; word shards list the entry numbers of each folded word. A query intersects the
  // lists of its words, then loads only the entry files of its first matches.

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
  }

  /** Picks the search shards for one folded query word, each followed by its parts in numeric order. */
  function resolveShards(shards, keys, word) {
    const bases = keys.filter((key) => !/\.\d+$/.test(key));
    const parts = (selected) => selected.flatMap((key) => [key].concat(keys.filter((part) => part.startsWith(key + "."))
      .sort((a, b) => Number(a.slice(a.lastIndexOf(".") + 1)) - Number(b.slice(b.lastIndexOf(".") + 1)))));
    // A shard prefix has at least two code units; a one-unit word finds the shards of every prefix it starts.
    for (let length = Math.min(2, word.length); length <= word.length; length++) {
      const key = shardKey(word.slice(0, length));
      if (Object.prototype.hasOwnProperty.call(shards, key)) return parts([key]);
      const deeper = bases.filter((k) => k.length > key.length && k.startsWith(key));
      if (!deeper.length) return [];
      if (length === word.length) return parts(deeper);
    }
    return [];
  }

  /** Keeps the most recently used documents only. Failed loads are not kept, so a retry can succeed. */
  function recentCache(limit, loadDoc) {
    const cache = new Map();
    const get = (key) => {
      let pending = cache.get(key);
      if (pending) {
        cache.delete(key);
      } else {
        pending = loadDoc(key);
        pending.catch(() => cache.get(key) === pending && cache.delete(key));
      }
      cache.set(key, pending);
      if (cache.size > limit) cache.delete(cache.keys().next().value);
      return pending;
    };
    get.clear = () => cache.clear();
    return get;
  }

  /** Checks a shard against the manifest. A posting list is an entry number, then gaps; -n is a run of n entries. */
  function checkShard(doc, key, count, entryCount) {
    checkDocument(doc, "searchShard");
    if (doc.key !== key) throw badIndex("shard key");
    if (!Array.isArray(doc.words) || !Array.isArray(doc.postings) || doc.words.length !== doc.postings.length) throw badIndex("shard");
    let total = 0;
    doc.postings.forEach((list, i) => {
      if (typeof doc.words[i] !== "string" || !Array.isArray(list) || !isCount(list[0])) throw badIndex("shard");
      let last = list[0];
      for (let j = 1; j < list.length; j++) {
        if (!Number.isInteger(list[j]) || !list[j]) throw badIndex("shard");
        last += Math.abs(list[j]);
        total += list[j] < 0 ? -list[j] - 1 : 0;
      }
      total += list.length;
      if (last >= entryCount) throw badIndex("shard");
    });
    if (total !== count) throw badIndex("shard posting count");
    return doc;
  }

  /** Decodes posting lists into one ascending list of distinct entry numbers. */
  function mergePostings(lists) {
    const out = [];
    let ascending = true;
    for (const list of lists) {
      let value = 0;
      list.forEach((step, i) => {
        for (let n = i && step < 0 ? -step : 1; n > 0; n--) {
          value = i ? value + (step < 0 ? 1 : step) : step;
          if (out.length && value <= out[out.length - 1]) ascending = false;
          out.push(value);
        }
      });
    }
    if (ascending) return out;
    out.sort((a, b) => a - b);
    return out.filter((value, i) => !i || value !== out[i - 1]);
  }

  function intersectPostings(a, b) {
    let j = 0;
    return a.filter((value) => {
      while (j < b.length && b[j] < value) j++;
      return b[j] === value;
    });
  }

  /** A label's own index word: U+0000 and the FNV-1a hash of its folded, separator-trimmed code units. */
  function labelToken(folded) {
    let hash = 2166136261;
    for (let i = 0; i < folded.length; i++) {
      hash = Math.imul(hash ^ folded.charCodeAt(i), 16777619);
    }
    return "\u0000" + ("0000000" + (hash >>> 0).toString(16)).slice(-8);
  }

  /**
   * Looks up entries of a searchEntries document, or of its stem of ancestors, as { parent, id, label, kind }. An
   * entry is [parent, head, id, tail, label, kind?]; head and tail count the code units its id shares with the
   * parent's id at the start and at the end.
   */
  function entryFile(doc, first, count) {
    checkDocument(doc, "searchEntries");
    if (doc.first !== first || !Array.isArray(doc.stem) || !Array.isArray(doc.entries) || doc.entries.length !== count) throw badIndex("entry file");
    const stem = new Map(doc.stem.map((item) => (Array.isArray(item) ? [item[0], item.slice(1)] : [])));
    const records = new Map();
    const raw = (n) => {
      const item = n >= first && n < first + count ? doc.entries[n - first] : stem.get(n);
      if (!Array.isArray(item) || item.length < 5 || item.length > 6 || !Number.isInteger(item[0]) || item[0] < -1 || item[0] >= n ||
          !isCount(item[1]) || typeof item[2] !== "string" || !isCount(item[3]) || typeof item[4] !== "string" ||
          (item.length > 5 && !isCount(item[5]))) {
        throw badIndex("entry " + n);
      }
      return item;
    };
    // Ancestors first, without recursion, so a deep tree cannot exhaust the stack.
    return (n) => {
      const pending = [];
      for (let k = n; k >= 0 && !records.has(k); k = raw(k)[0]) pending.push(k);
      while (pending.length) {
        const number = pending.pop();
        const item = raw(number);
        const parent = item[0] < 0 ? null : records.get(item[0]);
        const base = parent ? parent.id : "";
        if (item[1] + item[3] > base.length) throw badIndex("entry " + number);
        records.set(number, { parent: parent, id: base.slice(0, item[1]) + item[2] + base.slice(base.length - item[3]), label: item[4], kind: item[5] });
      }
      return records.get(n);
    };
  }

  /** Builds a search hit: the id path follows the parents, the context names the nearest two. */
  function entryHit(record, kinds) {
    const path = [];
    for (let r = record; r; r = r.parent) path.unshift(r.id);
    const hit = { path: path, label: record.label };
    if (record.kind !== undefined) {
      if (record.kind >= kinds.length) throw badIndex("entry kind");
      hit.kind = kinds[record.kind];
    }
    const parent = record.parent;
    if (parent) hit.context = parent.parent ? parent.parent.label + " / " + parent.label : parent.label;
    validateSearchHit(hit);
    return hit;
  }

  /** The entry file that holds entry n: the last one that starts at or before n. */
  function entryFileOf(starts, n) {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= n) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  /** Search over a bundle's index; load(ref) resolves a sidecar document, manifest() the checked manifest. */
  function sidecarSearch(load, manifest) {
    const index = async () => (await manifest()).search;
    const loadShard = recentCache(SHARD_CACHE, async (key) => {
      const search = await index();
      return checkShard(await load("s/k-" + key), key, search.shards[key], search.entryCount);
    });
    const loadEntries = recentCache(ENTRY_CACHE, async (file) => {
      const search = await index();
      const first = search.entryFiles[file];
      const end = file + 1 < search.entryFiles.length ? search.entryFiles[file + 1] : search.entryCount;
      return entryFile(await load("e/" + file), first, end - first);
    });

    /** The entries whose labels have a word that starts with the folded query word. */
    async function postingsOf(search, keys, word) {
      const lists = [];
      for (const shard of await Promise.all(resolveShards(search.shards, keys, word).map(loadShard))) {
        shard.words.forEach((indexed, i) => indexed.startsWith(word) && lists.push(shard.postings[i]));
      }
      return mergePostings(lists);
    }

    async function run(query, queryWords, limit) {
      const search = await index();
      if (!search) {
        return { hits: [], total: 0, truncated: false };
      }
      // A word that starts another query word adds nothing to match.
      const keyWords = queryWords.filter((word, i) => queryWords.indexOf(word) === i &&
        !queryWords.some((other) => other.length > word.length && other.startsWith(word)));
      const keys = Object.keys(search.shards);
      const folded = trimSeparators(foldText(query));
      const [exact, lists] = await Promise.all([postingsOf(search, keys, labelToken(folded)),
        Promise.all(keyWords.map((word) => postingsOf(search, keys, word)))]);
      const candidates = lists.sort((a, b) => a.length - b.length).reduce(intersectPostings);
      // Labels equal to the query are read first, then the other candidates in document order, until the result
      // list is full. At most SEARCH_CANDIDATES times the limit are ranked, so a query never reads the whole index.
      const order = exact.concat(candidates);
      const wanted = limit * SEARCH_CANDIDATES;
      const taken = new Set();
      const hits = [];
      let next = 0;
      while (next < order.length && hits.length < limit) {
        const files = [];
        let end = next;
        for (; end < order.length && hits.length + end - next < wanted; end++) {
          const file = entryFileOf(search.entryFiles, order[end]);
          if (files.indexOf(file) < 0) {
            // One round reads the files that fill the result list, however spread out; more only while they are few.
            if (files.length >= ENTRY_BATCH && hits.length + end - next >= limit) break;
            files.push(file);
          }
        }
        const loaded = await Promise.all(files.map(loadEntries));
        for (; next < end; next++) {
          const number = order[next];
          if (taken.has(number)) continue;
          const record = loaded[files.indexOf(entryFileOf(search.entryFiles, number))](number);
          // Two labels can share a token, so the label is compared with the query.
          if (next >= exact.length || trimSeparators(foldText(record.label)) === folded) {
            taken.add(number);
            hits.push(entryHit(record, search.kinds));
          }
        }
      }
      const ranked = rankHits(hits, query, limit);
      ranked.total = candidates.length;
      ranked.truncated = candidates.length > ranked.hits.length;
      return ranked;
    }

    return (query, limit) => {
      const queryWords = words(query);
      if (!queryWords.length) {
        return Promise.resolve({ hits: [], total: 0, truncated: false });
      }
      if (!queryWords.some((word) => word.length >= 2)) {
        return Promise.reject(new Error("CanopyX: sidecar search needs a word of at least two UTF-16 units."));
      }
      // A file that failed a check must not answer the next query from the cache.
      return run(query, queryWords, limit).catch((err) => {
        loadShard.clear();
        loadEntries.clear();
        throw err;
      });
    };
  }
