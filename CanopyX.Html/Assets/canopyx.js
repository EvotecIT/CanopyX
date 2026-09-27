/*
 * CanopyX browser runtime: a virtualized tree grid over the canopyx/1 data protocol. No dependencies.
 * Assembled from CanopyX.Html/Assets/canopyx.source/*.js by Build/Sync-Assets.ps1; edit the parts, not canopyx.js.
 */
(function (global) {
  "use strict";

  // A second copy of the runtime on the same page would take over the sidecar queue from the first; keep the first.
  if (global.CanopyX) {
    return;
  }

  const PROTOCOL = "canopyx/1";
  const OVERSCAN = 8;
  const TYPEAHEAD_MS = 600;
  const INDENT = 18;
  const COUNTS_BATCH = 50;
  let instanceSeq = 0;

  /** Creates an element with an optional class name. */
  function h(tag, className) {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    return element;
  }

  /** Sets text safely; every host string goes through textContent, never innerHTML. */
  function setText(element, value) {
    element.textContent = value == null ? "" : String(value);
  }

  function safeId(value) {
    return String(value).replace(/[^A-Za-z0-9_-]/g, "_");
  }

  /** Throws unless a document belongs to this protocol and has the expected type. */
  function checkDocument(doc, type) {
    if (!doc || typeof doc !== "object") {
      throw new Error("CanopyX: expected a " + type + " document, got " + typeof doc);
    }
    if (doc.protocol !== PROTOCOL) {
      throw new Error("CanopyX: unsupported protocol '" + doc.protocol + "' (this runtime reads " + PROTOCOL + ")");
    }
    if (doc.type !== type) {
      throw new Error("CanopyX: expected a " + type + " document, got '" + doc.type + "'");
    }
    return doc;
  }

  // ---------- cells ----------
  function isCellObject(cell) {
    return cell !== null && typeof cell === "object";
  }

  function cellValue(cell) {
    return isCellObject(cell) ? (cell.value === undefined ? null : cell.value) : (cell === undefined ? null : cell);
  }

  const numberFormats = new Map();
  function numberFormat(lang) {
    const key = lang || "";
    let format = numberFormats.get(key);
    if (!format) {
      try {
        format = new Intl.NumberFormat(lang || undefined, { maximumFractionDigits: 3 });
      } catch (e) {
        format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });
      }
      numberFormats.set(key, format);
    }
    return format;
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function formatDate(value) {
    const time = Date.parse(value);
    if (isNaN(time)) {
      return String(value);
    }
    const d = new Date(time);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + " UTC";
  }

  /** Formats a value without display text, following the protocol's default formatting table. */
  function formatValue(value, kind, lang) {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    if (typeof value === "number" && kind === "number") {
      return numberFormat(lang).format(value);
    }
    if (typeof value === "string" && kind === "datetime") {
      return formatDate(value);
    }
    return String(value);
  }

  function cellText(cell, column, lang) {
    if (isCellObject(cell) && typeof cell.text === "string") {
      return cell.text;
    }
    return formatValue(cellValue(cell), column.kind, lang);
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  /** Sort key: numbers (and parsed dates, booleans) rank 0, strings rank 1, empty rank 2. */
  function sortKey(cell, column) {
    let value = cellValue(cell);
    if ((value === null || value === "") && isCellObject(cell) && typeof cell.text === "string" && cell.text !== "") {
      value = cell.text;
    }
    if (value === null || value === "") {
      return { rank: 2, value: 0 };
    }
    if (typeof value === "boolean") {
      return { rank: 0, value: value ? 1 : 0 };
    }
    if (typeof value === "number") {
      return { rank: 0, value: value };
    }
    if (column.kind === "datetime") {
      const time = Date.parse(value);
      if (!isNaN(time)) {
        return { rank: 0, value: time };
      }
    }
    return { rank: 1, value: String(value) };
  }

  function compareKeys(a, b, direction) {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    if (a.rank === 2) {
      return 0;
    }
    const order = a.rank === 0 ? (a.value < b.value ? -1 : a.value > b.value ? 1 : 0) : collator.compare(a.value, b.value);
    return order * direction;
  }

  // ---------- search text folding (shared rules with the C# bundle writer, see docs/data-protocol.md) ----------
  function foldUnit(unit) {
    const code = unit.charCodeAt(0);
    if (code < 128) {
      return code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : unit;
    }
    const lower = unit.toLowerCase();
    return lower.length === 1 ? lower : unit;
  }

  function isSeparator(code) {
    return code < 128 && !((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122));
  }

  function foldText(text) {
    const source = String(text == null ? "" : text);
    let out = "";
    for (let i = 0; i < source.length; i++) {
      out += foldUnit(source.charAt(i));
    }
    return out;
  }

  /** Splits text into folded words. */
  function words(text) {
    const folded = foldText(text);
    const out = [];
    let current = "";
    for (let i = 0; i < folded.length; i++) {
      if (isSeparator(folded.charCodeAt(i))) {
        if (current) {
          out.push(current);
          current = "";
        }
      } else {
        current += folded.charAt(i);
      }
    }
    if (current) {
      out.push(current);
    }
    return out;
  }

  function matchesWords(labelWords, queryWords) {
    return queryWords.every((q) => labelWords.some((w) => w.startsWith(q)));
  }

  function rankLabel(label, query) {
    const l = foldText(label);
    const q = foldText(query).trim();
    return l === q ? 0 : l.startsWith(q) ? 1 : 2;
  }

  /** Encodes a folded prefix as a shard key: a-z and 0-9 stay, other code units become _ plus four hex digits. */
  function shardKey(prefix) {
    let out = "";
    for (let i = 0; i < prefix.length; i++) {
      const code = prefix.charCodeAt(i);
      out += (code >= 97 && code <= 122) || (code >= 48 && code <= 57) ? prefix.charAt(i) : "_" + ("000" + code.toString(16)).slice(-4);
    }
    return out;
  }

  // ---------- sidecar registry ----------
  // Sidecar files run (self.CanopyXSidecar = self.CanopyXSidecar || []).push([viewId, ref, document]). Files that ran
  // before the runtime left entries in a plain array; the runtime drains it and replaces push, so load order does not
  // matter. Script tags are used because browsers block fetch() of local files on file://.
  const sidecarDocs = new Map();
  const sidecarWaiters = new Map();

  function sidecarKey(view, ref) {
    return view + "\n" + ref;
  }

  function acceptSidecar(entry) {
    if (!Array.isArray(entry) || entry.length !== 3) {
      return;
    }
    const key = sidecarKey(entry[0], entry[1]);
    const waiter = sidecarWaiters.get(key);
    if (waiter) {
      sidecarWaiters.delete(key);
      waiter.resolve(entry[2]);
    } else {
      sidecarDocs.set(key, entry[2]);
    }
  }

  const sidecarQueue = global.CanopyXSidecar = global.CanopyXSidecar || [];
  sidecarQueue.forEach(acceptSidecar);
  sidecarQueue.length = 0;
  sidecarQueue.push = function () {
    for (let i = 0; i < arguments.length; i++) {
      acceptSidecar(arguments[i]);
    }
    return 0;
  };

  /** Loads one sidecar document by injecting its script; resolves with the document the script registers. */
  function loadSidecar(base, view, ref) {
    const key = sidecarKey(view, ref);
    if (sidecarDocs.has(key)) {
      const doc = sidecarDocs.get(key);
      sidecarDocs.delete(key);
      return Promise.resolve(doc);
    }
    const pending = sidecarWaiters.get(key);
    if (pending) {
      return pending.promise;
    }
    const waiter = {};
    waiter.promise = new Promise((resolve, reject) => {
      waiter.resolve = resolve;
      waiter.reject = reject;
    });
    sidecarWaiters.set(key, waiter);
    const script = document.createElement("script");
    script.src = base + ref + ".js";
    script.async = true;
    script.onload = () => {
      script.remove();
      if (sidecarWaiters.get(key) === waiter) {
        sidecarWaiters.delete(key);
        waiter.reject(new Error("Sidecar file did not register its data: " + ref));
      }
    };
    script.onerror = () => {
      script.remove();
      if (sidecarWaiters.get(key) === waiter) {
        sidecarWaiters.delete(key);
        waiter.reject(new Error("Sidecar file is missing: " + ref));
      }
    };
    document.head.appendChild(script);
    return waiter.promise;
  }

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
          // Depth-first without recursion; each stack entry carries the path and labels above the node.
          const stack = (view.roots || []).map((node) => ({ node: node, path: [], labels: [] })).reverse();
          while (stack.length) {
            const item = stack.pop();
            const path = item.path.concat(item.node.id);
            if (matchesWords(wordsOf(item.node), queryWords)) {
              hits.push({ path: path, label: item.node.label, kind: item.node.kind, context: item.labels.join(" / ") });
            }
            const children = item.node.children || [];
            for (let i = children.length - 1; i >= 0; i--) {
              stack.push({ node: children[i], path: path, labels: item.labels.concat(item.node.label) });
            }
          }
        }
        return Promise.resolve(rankHits(hits, query, limit));
      }
    };
  }

  /** Picks the search shards for one folded query word (see "Sidecar" in docs/data-protocol.md). */
  function resolveShards(shards, keys, word) {
    for (let length = 2; length <= word.length; length++) {
      const key = shardKey(word.slice(0, length));
      if (Object.prototype.hasOwnProperty.call(shards, key)) {
        return [key];
      }
      const deeper = keys.filter((k) => k.length > key.length && k.startsWith(key));
      if (!deeper.length) {
        return [];
      }
      if (length === word.length) {
        return deeper;
      }
    }
    return [];
  }

  function sidecarSource(view) {
    const base = view.source.base;
    const load = (ref) => loadSidecar(base, view.id, ref);
    const shardCache = new Map();
    let manifestPromise = null;
    // Failed loads are not cached, so a retry can succeed once the file is back.
    const manifest = () => manifestPromise || (manifestPromise = load("manifest").then((doc) => checkDocument(doc, "manifest")).catch((err) => {
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
        const doc = checkDocument(await load(ref), "page");
        return { items: doc.items || [], total: doc.total, next: doc.next || null, offset: doc.offset || 0 };
      },
      async search(query, limit) {
        const m = await manifest();
        const queryWords = words(query);
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
            const pathKey = item.entry.path.join("\n");
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
        const doc = await getJson(fill(source.children, {
          ref: node ? encodeURIComponent(node.ref || node.id) : "",
          cursor: cursor ? encodeURIComponent(cursor) : ""
        }), "page");
        return { items: doc.items || [], total: doc.total, next: doc.next || null, offset: doc.offset || 0 };
      },
      async search(query, limit) {
        if (!source.search) {
          return { hits: [], total: 0, truncated: false };
        }
        const doc = await getJson(fill(source.search, { query: encodeURIComponent(query), limit: String(limit) }), "search");
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

  // ---------- tree grid: model ----------
  // Loaded nodes keep their children. The visible rows are a flat array rebuilt on every structure change, in time
  // proportional to the visible rows. Rows have a fixed height; a detail row spans several row slots.
  class TreeGrid {
    constructor(host, options) {
      const view = checkDocument(options.view, "view");
      this.host = host;
      this.view = view;
      this.opts = options;
      this.id = "cx" + ++instanceSeq;
      this.source = options.source || sourceFor(view);
      this.rowH = view.rowHeight || 28;
      this.pageSize = view.pageSize || 100;
      this.multi = view.selection === "multiple";
      this.lang = document.documentElement.lang || undefined;
      this.columns = view.columns.map((column, index) => Object.assign({}, column, { hidden: index > 0 && !!column.hidden }));
      this.keyMap = new Map();
      this.root = { key: null, h: null, parent: null, level: 0, idx: 0, expanded: true, children: null, total: null, next: null, loading: false, error: null, span: 1 };
      if (!view.source || view.source.kind === "inline") {
        this.root.inlineItems = view.roots || [];
      }
      this.rows = [];
      this.tops = [0];
      this.total = 0;
      this.version = 1;
      this.rendered = new Map();
      this.pool = [];
      this.focused = null;
      this.selected = new Set();
      this.anchor = null;
      this.filter = null;
      this.filterExpand = false;
      this.activeFilters = new Set();
      this.sortState = null;
      this.typeBuf = "";
      this.typeAt = 0;
      this.rafId = 0;
      this.iconTemplates = this.buildIcons(view.icons || {});
      this.build();
      this.buildToolbar();
      this.ready = this.init();
    }

    buildIcons(icons) {
      const templates = new Map();
      Object.keys(icons).forEach((key) => {
        const holder = h("span", "cx-icon");
        holder.setAttribute("aria-hidden", "true");
        holder.innerHTML = icons[key]; // trusted host SVG, declared once per view
        templates.set(key, holder);
      });
      return templates;
    }

    async init() {
      try {
        this.rootsReady = this.loadRoots();
        await this.rootsReady;
        await this.expandInitial(this.root);
        await this.restoreState();
        await this.openDeepLink();
      } finally {
        if (!this.destroyed) {
          this.host.setAttribute("data-cx-ready", "true");
          this.emit("ready", {});
        }
      }
    }

    /** Shows the first page of top-level nodes: synchronously for inline data, from the source otherwise. */
    loadRoots() {
      if (!this.root.inlineItems) {
        return this.loadPage(this.root, null);
      }
      const first = slicePage(this.root.inlineItems, null, this.pageSize);
      this.root.inline = true;
      this.root.children = first.items.map((node, i) => this.wrap(node, this.root, i));
      this.root.total = first.total;
      this.root.next = first.next;
      this.applySort(this.root, false);
      this.relayout();
      return Promise.resolve();
    }

    /** Loads lazy children of nodes that start expanded. */
    async expandInitial(parent) {
      if (this.destroyed) return;
      for (const w of parent.children || []) {
        if (w.autoExpand && !w.children) {
          w.autoExpand = false;
          await this.toggle(w, true);
        }
        if (w.expanded && w.children) {
          await this.expandInitial(w);
        }
      }
    }

    wrap(node, parent, index) {
      const w = {
        key: node.id, h: node, parent: parent, level: parent.level + 1, idx: index, expanded: false,
        children: null, total: null, next: null, inline: false, loading: false, error: null,
        span: node.detail ? Math.max(1, node.detail.height || 1) : 1, _v: 0
      };
      this.keyMap.set(node.id, w);
      if (Array.isArray(node.children)) {
        const first = slicePage(node.children, null, this.pageSize);
        w.inline = true;
        w.children = first.items.map((child, i) => this.wrap(child, w, i));
        w.total = first.total;
        w.next = first.next;
        w.expanded = !!node.expanded;
        this.applySort(w, false);
      } else if (node.hasChildren) {
        w.total = typeof node.childCount === "number" ? node.childCount : null;
        w.autoExpand = !!node.expanded;
      }
      return w;
    }

    expandable(w) {
      return !!(w && w.h && !w.h.detail && (w.h.hasChildren || (w.children && w.children.length)));
    }

    /** 2 = the node matches (its subtree shows), 1 = kept as an ancestor of matches, 0 = hidden. */
    matchState(w) {
      if (w._fm !== undefined) {
        return w._fm;
      }
      let state = this.filter.match(w.h) ? 2 : 0;
      if (!state && this.filter.keep && this.filter.keep(w.h)) {
        state = 1;
      }
      if (!state && w.children) {
        for (const child of w.children) {
          if (this.matchState(child) > 0) {
            state = 1;
            break;
          }
        }
      }
      w._fm = state;
      return state;
    }

    relayout() {
      if (this.destroyed) return;
      const rows = [];
      const filter = this.filter;
      if (filter) {
        this.keyMap.forEach((w) => { w._fm = undefined; });
      }
      const walk = (parent, filtered) => {
        let pos = 0;
        for (const w of parent.children || []) {
          let filterChildren = false;
          if (filtered) {
            const state = this.matchState(w);
            if (!state) {
              continue;
            }
            filterChildren = state === 1;
          }
          w.pos = ++pos;
          rows.push(w);
          // A node opens when the user expanded it (its first page may still be loading or have failed) or when a
          // filter reveals loaded matches below it, unless the user collapsed it while that filter was on.
          const autoOpen = filterChildren && this.filterExpand && !w.filterCollapsed && w.children && w.children.length;
          w._open = !!((w.expanded && (w.children || w.loading || w.error)) || autoOpen);
          if (w._open) {
            walk(w, filterChildren);
          }
        }
        parent.visibleCount = pos;
        // "Show more" stays under filtered branches too: matches on pages not loaded yet must stay reachable.
        if (parent.loading) {
          rows.push(this.statusRow(parent, "loading"));
        } else if (parent.error) {
          rows.push(this.statusRow(parent, "error"));
        } else if (parent.next) {
          rows.push(this.statusRow(parent, "more"));
        }
      };
      walk(this.root, !!filter);
      this.rows = rows;
      const tops = new Array(rows.length + 1);
      let y = 0;
      for (let i = 0; i < rows.length; i++) {
        rows[i]._ri = i;
        tops[i] = y;
        y += rows[i].span * this.rowH;
      }
      tops[rows.length] = y;
      this.tops = tops;
      this.total = y;
      this.canvas.style.height = y + "px";
      this.grid.setAttribute("aria-rowcount", String(rows.length + 1));
      if (this.focused && this.indexOf(this.focused) < 0) {
        this.focused = null;
      }
      this.scheduleRender();
    }

    statusRow(parent, kind) {
      let row = parent["_" + kind];
      if (!row) {
        row = parent["_" + kind] = { key: null, status: kind, parent: parent, level: parent.level + 1, span: 1, h: { id: "", label: "" }, _v: 0 };
      }
      const loaded = parent.children ? parent.children.length : 0;
      const format = numberFormat(this.lang);
      row.h.label = kind === "loading" ? "Loading…" : kind === "error" ? "Could not load: " + parent.error + " (Enter to retry)" :
        parent.total != null ? "Show more (" + format.format(loaded) + " of " + format.format(parent.total) + " loaded)" : "Show more (" + format.format(loaded) + " loaded)";
      row._v = 0;
      return row;
    }

    applySort(parent, deep) {
      const children = parent.children;
      if (!children) {
        return;
      }
      const state = this.sortState;
      const column = state && this.columns.find((c) => c.id === state.column);
      if (column) {
        const direction = state.direction === "desc" ? -1 : 1;
        const index = this.columns.indexOf(column);
        const keys = new Map();
        const keyOf = (w) => {
          let key = keys.get(w);
          if (!key) {
            key = sortKey(this.cellOf(w.h, column, index), column);
            keys.set(w, key);
          }
          return key;
        };
        children.sort((a, b) => compareKeys(keyOf(a), keyOf(b), direction) || a.idx - b.idx);
      } else {
        children.sort((a, b) => a.idx - b.idx);
      }
      if (deep) {
        for (const child of children) {
          this.applySort(child, true);
        }
      }
    }

    /** The cell for a column; the tree column falls back to the label. */
    cellOf(node, column, index) {
      const cells = node.cells;
      if (cells && Object.prototype.hasOwnProperty.call(cells, column.id)) {
        return cells[column.id];
      }
      return index === 0 ? node.label : undefined;
    }

    emit(name, detail) {
      if (this.destroyed) return;
      this.host.dispatchEvent(new CustomEvent("canopyx:" + name, { detail: detail, bubbles: true }));
    }
  }

  // ---------- tree grid: DOM scaffold and windowed rendering ----------
  Object.assign(TreeGrid.prototype, {
    build() {
      const host = this.host;
      host.classList.add("cx-host");
      if (!host.hasAttribute("data-cx-theme")) {
        host.setAttribute("data-cx-theme", "auto");
      }
      host.style.setProperty("--cx-row-h", this.rowH + "px");
      this.toolbar = h("div", "cx-toolbar");
      this.toolbar.hidden = true;
      const grid = this.grid = h("div", "cx-grid");
      grid.id = this.id;
      grid.setAttribute("role", "treegrid");
      grid.setAttribute("aria-label", this.view.label);
      if (this.multi) {
        grid.setAttribute("aria-multiselectable", "true");
      }
      this.head = h("div", "cx-head");
      this.head.setAttribute("role", "rowgroup");
      this.headRow = h("div", "cx-hrow");
      this.headRow.setAttribute("role", "row");
      this.headRow.setAttribute("aria-rowindex", "1");
      this.head.appendChild(this.headRow);
      this.canvas = h("div", "cx-canvas");
      this.canvas.setAttribute("role", "rowgroup");
      grid.appendChild(this.head);
      grid.appendChild(this.canvas);
      this.live = h("div", "cx-sr-only");
      this.live.setAttribute("aria-live", "polite");
      this.outline = h("div", "cx-outline");
      host.appendChild(this.toolbar);
      host.appendChild(grid);
      host.appendChild(this.live);
      host.appendChild(this.outline);
      this.buildHeader();
      this.onScroll = () => this.scheduleRender(true);
      this.onPrint = () => { this.outline.innerHTML = this.toOutline(); };
      grid.addEventListener("scroll", this.onScroll, { passive: true });
      grid.addEventListener("click", (e) => this.onClick(e));
      grid.addEventListener("dblclick", (e) => this.onDblClick(e));
      grid.addEventListener("keydown", (e) => this.onKey(e));
      // Tabbing into the grid lands on the tab-stop row; adopt it so arrows start there and recycling keeps it.
      this.canvas.addEventListener("focusin", (e) => {
        const rowEl = e.target.closest(".cx-row");
        if (rowEl && rowEl._w && this.focused !== rowEl._w) {
          this.focusRevision = (this.focusRevision || 0) + 1;
          if (this.focused) {
            this.focused._v = 0;
          }
          this.focused = rowEl._w;
        }
      });
      global.addEventListener("beforeprint", this.onPrint);
      this.resizeObserver = new ResizeObserver(() => this.scheduleRender());
      this.resizeObserver.observe(grid);
    },

    visibleColumns() {
      return this.columns.filter((column) => !column.hidden);
    },

    buildHeader() {
      // Rebuilding the header replaces its buttons; keep keyboard focus on the same column's sort button.
      const active = document.activeElement;
      const focusedColumn = active && this.headRow.contains(active) ? active.closest(".cx-hcell").getAttribute("data-cx-column") : null;
      this.cols = this.visibleColumns();
      this.columnIndex = this.cols.map((column) => this.columns.indexOf(column));
      this.grid.setAttribute("aria-colcount", String(this.cols.length));
      this.headRow.textContent = "";
      this.headCells = this.cols.map((column, i) => {
        const cell = h("div", "cx-hcell cx-kind-" + (column.kind || "text"));
        cell.setAttribute("role", "columnheader");
        cell.setAttribute("data-cx-column", column.id);
        cell.setAttribute("aria-colindex", String(i + 1));
        if (column.sortable) {
          const sorted = this.sortState && this.sortState.column === column.id ? this.sortState.direction : null;
          cell.setAttribute("aria-sort", sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none");
          const button = h("button", "cx-sort");
          button.type = "button";
          setText(button, column.title);
          button.addEventListener("click", () => this.sort(column.id, sorted === "asc" ? "desc" : sorted === "desc" ? null : "asc"));
          cell.appendChild(button);
        } else {
          const title = h("span", "cx-htext");
          setText(title, column.title);
          cell.appendChild(title);
        }
        const grip = h("span", "cx-resize");
        grip.setAttribute("aria-hidden", "true");
        grip.addEventListener("pointerdown", (e) => this.startResize(e, column));
        cell.appendChild(grip);
        this.headRow.appendChild(cell);
        return cell;
      });
      this.applyWidths();
      if (focusedColumn) {
        const index = this.cols.findIndex((c) => c.id === focusedColumn);
        const button = index >= 0 ? this.headCells[index].querySelector("button") : null;
        if (button) {
          button.focus();
        }
      }
    },

    applyWidths() {
      let sum = 0;
      this.cols.forEach((column, i) => {
        this.headCells[i].style.width = column.width + "px";
        sum += column.width;
      });
      this.rowWidth = sum;
      this.headRow.style.width = sum + "px";
      this.canvas.style.width = sum + "px";
      // A new column layout makes every row rebuild its cell skeleton once.
      this.layout = (this.layout || 0) + 1;
      this.version++;
      this.scheduleRender();
    },

    startResize(e, column) {
      e.preventDefault();
      const x0 = e.clientX;
      const w0 = column.width;
      const move = (ev) => {
        column.width = Math.max(40, w0 + ev.clientX - x0);
        this.applyWidths();
      };
      const up = () => {
        global.removeEventListener("pointermove", move);
        global.removeEventListener("pointerup", up);
      };
      global.addEventListener("pointermove", move);
      global.addEventListener("pointerup", up);
    },

    scheduleRender() {
      if (this.destroyed) return;
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = 0;
          this.render(this.renderFromScroll);
        });
      }
    },

    rowAt(y) {
      const tops = this.tops;
      let lo = 0;
      let hi = this.rows.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (tops[mid] <= y) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      return Math.max(0, lo);
    },

    indexOf(w) {
      const i = w ? w._ri : undefined;
      return i !== undefined && this.rows[i] === w ? i : -1;
    },

    /**
     * Renders the rows in the viewport plus a small overscan and the focused row. A row that leaves the window is
     * reused in place for a row that enters it: it stays attached, keeps its cells, and only its content and position
     * change. Detaching and re-inserting rows (or moving them to keep DOM order) forces the browser to restyle whole
     * rows, which is what dropped frames under CPU pressure. Positions and attributes are written only when they change.
     */
    render(fromScroll) {
      if (this.destroyed) {
        return;
      }
      const grid = this.grid;
      const viewHeight = grid.clientHeight - this.head.offsetHeight;
      const top = grid.scrollTop;
      const n = this.rows.length;
      const first = n ? Math.max(0, this.rowAt(top) - OVERSCAN) : 0;
      const last = n ? Math.min(n - 1, this.rowAt(top + viewHeight) + OVERSCAN) : -1;
      const want = new Set();
      for (let i = first; i <= last; i++) {
        want.add(this.rows[i]);
      }
      if (this.focused) {
        want.add(this.focused);
      }
      const free = [];
      const active = document.activeElement;
      for (const [w, rowEl] of this.rendered) {
        if (!want.has(w)) {
          this.rendered.delete(w);
          if (rowEl.contains(active)) {
            // Reusing it would leave keyboard focus on a row that now shows another node.
            rowEl.remove();
            rowEl._w = null;
          } else {
            // Repaint a departing row while detached, then insert it in the new window's DOM order. Its cell
            // skeleton survives; retained rows do not need repainting or moving during downward scrolling.
            rowEl.remove();
            free.push(rowEl);
          }
        }
      }
      // With nothing focused, the tab stop is the first row inside the viewport (not an overscan row).
      const tabRow = this.focused || this.rows[n ? this.rowAt(top) : 0] || null;
      const fragment = document.createDocumentFragment();
      for (const w of want) {
        const index = this.indexOf(w);
        if (index < 0) {
          continue;
        }
        let rowEl = this.rendered.get(w);
        if (!rowEl) {
          rowEl = free.pop() || this.pool.pop() || h("div");
          if (!rowEl.parentNode) {
            fragment.appendChild(rowEl);
          }
          this.rendered.set(w, rowEl);
          w._v = 0;
        }
        if (w._v !== this.version || rowEl._w !== w) {
          this.fillRow(rowEl, w);
          w._v = this.version;
        }
        const y = this.tops[index];
        if (rowEl._top !== y) {
          rowEl.style.transform = "translateY(" + y + "px)";
          rowEl._top = y;
        }
        if (rowEl._index !== index) {
          rowEl.setAttribute("aria-rowindex", String(index + 2));
          rowEl._index = index;
        }
        const alt = index % 2 === 1 && !w.status && !w.h.detail;
        if (rowEl._alt !== alt) {
          rowEl.classList.toggle("cx-alt", alt);
          rowEl._alt = alt;
        }
        const tab = w === tabRow ? 0 : -1;
        if (rowEl._tab !== tab) {
          rowEl.tabIndex = tab;
          rowEl._tab = tab;
        }
      }
      for (const rowEl of free) {
        rowEl.remove();
        rowEl._w = null;
        if (this.pool.length < 200) {
          this.pool.push(rowEl);
        }
      }
      if (fragment.childNodes.length) {
        this.canvas.appendChild(fragment);
      }
      this.window = { first: first, last: last };
      // Browse-mode assistive technology reads DOM order even while wheel or touch scrolling continues.
      this.keepDomOrder(first, last);
    },

    // Screen readers in browse mode read rows in DOM order, so rows are kept (or put back) in visual order. The focused
    // row is never moved, because moving a focused element drops its focus. After in-place reuse the DOM is usually a
    // rotation of the visual order, and moving the smaller block keeps the number of restyled rows low.
    keepDomOrder(first, last) {
      const ordered = [];
      const focusedIndex = this.focused ? this.indexOf(this.focused) : -1;
      const focusedEl = focusedIndex >= 0 ? this.rendered.get(this.focused) : null;
      if (focusedEl && focusedIndex < first) {
        ordered.push(focusedEl);
      }
      for (let i = first; i <= last; i++) {
        const rowEl = this.rendered.get(this.rows[i]);
        if (rowEl) {
          ordered.push(rowEl);
        }
      }
      if (focusedEl && focusedIndex > last) {
        ordered.push(focusedEl);
      }
      const kids = Array.prototype.slice.call(this.canvas.children);
      const n = ordered.length;
      let inOrder = kids.length === n;
      for (let k = 0; inOrder && k < n; k++) {
        inOrder = kids[k] === ordered[k];
      }
      if (inOrder) {
        return;
      }
      if (kids.length === n && !focusedEl) {
        const shift = kids.indexOf(ordered[0]);
        let rotation = shift > 0;
        for (let k = 0; rotation && k < n; k++) {
          rotation = kids[(shift + k) % n] === ordered[k];
        }
        if (rotation) {
          if (shift <= n - shift) {
            for (let k = 0; k < shift; k++) {
              this.canvas.appendChild(kids[k]);
            }
          } else {
            for (let k = n - 1; k >= shift; k--) {
              this.canvas.insertBefore(kids[k], this.canvas.firstChild);
            }
          }
          return;
        }
      }
      const p = focusedEl ? ordered.indexOf(focusedEl) : -1;
      if (p < 0) {
        let node = this.canvas.firstChild;
        for (const rowEl of ordered) {
          if (node === rowEl) {
            node = node.nextSibling;
          } else {
            this.canvas.insertBefore(rowEl, node);
          }
        }
        return;
      }
      let ref = focusedEl;
      for (let k = p - 1; k >= 0; k--) {
        if (ordered[k].nextSibling !== ref) {
          this.canvas.insertBefore(ordered[k], ref);
        }
        ref = ordered[k];
      }
      let prev = focusedEl;
      for (let k = p + 1; k < ordered.length; k++) {
        if (prev.nextSibling !== ordered[k]) {
          this.canvas.insertBefore(ordered[k], prev.nextSibling);
        }
        prev = ordered[k];
      }
    }
  });

  // ---------- tree grid: row and cell painting ----------
  // A row element keeps a skeleton of cells for the current column layout. Recycling it for another node only updates
  // text nodes, classes, attributes, and badges that differ, instead of rebuilding every cell; rebuilding was what made
  // scrolling drop frames under CPU pressure in the D21 spike. The skeleton is rebuilt only when the row changes kind
  // (node, detail, status) or the columns change.
  function setAttr(element, name, value) {
    const cache = element._attrs || (element._attrs = {});
    if (cache[name] === value) {
      return;
    }
    cache[name] = value;
    if (value === null) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value);
    }
  }

  function setClass(element, value) {
    if (element._cls !== value) {
      element.className = value;
      element._cls = value;
      element._alt = false;
    }
  }

  Object.assign(TreeGrid.prototype, {
    /** Paints a row for a node or a status row. The row element may be recycled from another node. */
    fillRow(rowEl, w) {
      rowEl._w = w;
      const kind = w.status ? "status" : w.h.detail ? "detail" : "node";
      if (rowEl._kind !== kind || rowEl._layout !== this.layout) {
        this.buildRow(rowEl, kind);
      }
      setAttr(rowEl, "aria-level", String(w.level));
      const height = w.span * this.rowH + "px";
      if (rowEl._height !== height) {
        rowEl.style.height = height;
        rowEl._height = height;
      }
      if (kind === "status") {
        this.paintStatusRow(rowEl, w);
      } else if (kind === "detail") {
        this.paintDetailRow(rowEl, w);
      } else {
        this.paintNodeRow(rowEl, w);
      }
    },

    buildRow(rowEl, kind) {
      rowEl.textContent = "";
      // The attribute cache is reset with the skeleton, so drop what a node row of another kind left behind.
      ["aria-expanded", "aria-busy", "aria-setsize", "aria-posinset", "aria-selected", "data-cx-id", "data-cx-status", "data-kind"].forEach((name) => rowEl.removeAttribute(name));
      rowEl._attrs = {};
      rowEl._cls = null;
      rowEl._kind = kind;
      rowEl._layout = this.layout;
      rowEl._height = null;
      rowEl.setAttribute("role", "row");
      rowEl.style.width = this.rowWidth + "px";
      if (kind !== "node") {
        const cell = this.cell(rowEl, 0, this.rowWidth);
        cell.setAttribute("aria-colspan", String(this.cols.length));
        rowEl._cells = [{ cell: cell }];
        if (kind === "status") {
          const indent = cell.appendChild(h("span", "cx-indent"));
          const label = cell.appendChild(h("span"));
          rowEl._cells[0].indent = indent;
          rowEl._cells[0].label = label;
          rowEl._cells[0].text = label.appendChild(document.createTextNode(""));
        }
        return;
      }
      rowEl._cells = this.cols.map((column, i) => {
        const cell = this.cell(rowEl, i, column.width, column.kind);
        const slot = { cell: cell, base: cell.className + (i === 0 ? " cx-tree" : ""), cls: null, title: null, badges: [], iconKey: null, iconEl: null };
        cell.className = slot.base;
        if (i === 0) {
          slot.indent = cell.appendChild(h("span", "cx-indent"));
          slot.exp = cell.appendChild(h("span", "cx-exp"));
          slot.exp.setAttribute("aria-hidden", "true");
          slot.content = cell.appendChild(h("span", "cx-content"));
        } else {
          slot.content = cell;
        }
        slot.textSpan = slot.content.appendChild(h("span", "cx-text"));
        slot.text = slot.textSpan.appendChild(document.createTextNode(""));
        return slot;
      });
    },

    paintStatusRow(rowEl, w) {
      setClass(rowEl, "cx-row cx-status cx-" + w.status);
      setAttr(rowEl, "data-cx-status", w.status);
      const slot = rowEl._cells[0];
      slot.label.className = w.status === "more" ? "cx-more-btn" : "cx-status-text";
      slot.indent.style.width = (w.level - 1) * INDENT + "px";
      if (slot.text.data !== w.h.label) {
        slot.text.data = w.h.label;
      }
    },

    paintDetailRow(rowEl, w) {
      const node = w.h;
      setClass(rowEl, "cx-row cx-detail" + (node.className ? " " + node.className : ""));
      this.paintRowState(rowEl, w);
      // Detail content (and anything a host renderDetail callback set on the cell) is rebuilt on a fresh cell.
      const old = rowEl._cells[0].cell;
      const cell = this.cell(rowEl, 0, this.rowWidth);
      rowEl.replaceChild(cell, old);
      rowEl._cells[0].cell = cell;
      cell.setAttribute("aria-colspan", String(this.cols.length));
      cell.style.paddingLeft = (w.level - 1) * INDENT + 8 + "px";
      this.renderDetail(node, cell);
    },

    paintNodeRow(rowEl, w) {
      const node = w.h;
      setClass(rowEl, "cx-row" + (node.group ? " cx-group" : "") + (node.className ? " " + node.className : ""));
      this.paintRowState(rowEl, w);
      setAttr(rowEl, "aria-expanded", this.expandable(w) ? (w._open ? "true" : "false") : null);
      setAttr(rowEl, "aria-busy", w.loading ? "true" : null);
      const slots = rowEl._cells;
      for (let i = 0; i < this.cols.length; i++) {
        const slot = slots[i];
        if (i === 0) {
          this.paintTreeSlot(slot, w);
        }
        this.paintSlot(slot, node, this.cols[i], this.columnIndex[i], w);
      }
    },

    /** Attributes shared by node and detail rows. */
    paintRowState(rowEl, w) {
      const node = w.h;
      setAttr(rowEl, "data-cx-id", node.id);
      setAttr(rowEl, "data-kind", node.kind || null);
      setAttr(rowEl, "data-cx-status", null);
      setAttr(rowEl, "aria-selected", this.selected.has(w) ? "true" : "false");
      this.setPosition(rowEl, w);
    },

    /**
     * aria-posinset is the position among the visible siblings in display (sorted) order. aria-setsize counts children
     * that are not loaded yet; -1 means the total is unknown.
     */
    setPosition(rowEl, w) {
      const parent = w.parent;
      const loaded = parent.children ? parent.children.length : 0;
      const size = this.filter ? parent.visibleCount : parent.total != null ? Math.max(parent.total, loaded) : parent.next ? -1 : loaded;
      setAttr(rowEl, "aria-setsize", String(size));
      setAttr(rowEl, "aria-posinset", String(w.pos));
    },

    paintTreeSlot(slot, w) {
      const level = w.level;
      if (slot.level !== level) {
        slot.indent.style.width = (level - 1) * INDENT + "px";
        slot.level = level;
      }
      const expander = this.expandable(w) ? "cx-exp" : "cx-exp cx-leaf";
      if (slot.expCls !== expander) {
        slot.exp.className = expander;
        slot.expCls = expander;
      }
      const key = w.h.icon && this.iconTemplates.has(w.h.icon) ? w.h.icon : null;
      if (slot.iconKey !== key) {
        if (slot.iconEl) {
          slot.iconEl.remove();
        }
        slot.iconEl = key ? this.iconTemplates.get(key).cloneNode(true) : null;
        if (slot.iconEl) {
          slot.cell.insertBefore(slot.iconEl, slot.content);
        }
        slot.iconKey = key;
      }
    },

    paintSlot(slot, node, column, index, w) {
      const value = this.cellOf(node, column, index);
      if (this.opts.renderCell) {
        // Host-rendered cells own their content, so they are rebuilt on every paint, from a clean cell.
        slot.cell.className = slot.base;
        slot.cell.removeAttribute("title");
        slot.cls = slot.base;
        slot.title = null;
        slot.content.textContent = "";
        slot.badges = [];
        slot.content.appendChild(slot.textSpan);
        if (this.opts.renderCell(node, column.id, slot.content, { level: w.level, expanded: w.expanded, index: index }) === true) {
          slot.textSpan.remove();
          return;
        }
      }
      const text = cellText(value, column, this.lang);
      if (slot.text.data !== text) {
        slot.text.data = text;
      }
      const object = isCellObject(value);
      const cls = slot.base + (object && value.tone ? " cx-tone-" + value.tone : "");
      if (slot.cls !== cls) {
        slot.cell.className = cls;
        slot.cls = cls;
      }
      const title = object && value.title ? value.title : null;
      if (slot.title !== title) {
        if (title) {
          slot.cell.title = title;
        } else {
          slot.cell.removeAttribute("title");
        }
        slot.title = title;
      }
      this.paintBadges(slot, (index === 0 && node.badges) || null, object && value.badges ? value.badges : null);
    },

    /** Reuses badge elements: updates the ones that exist, adds missing ones, removes extras. */
    paintBadges(slot, first, second) {
      const count = (first ? first.length : 0) + (second ? second.length : 0);
      for (let k = 0; k < count; k++) {
        const badge = first && k < first.length ? first[k] : second[k - (first ? first.length : 0)];
        let span = slot.badges[k];
        if (!span) {
          span = slot.content.appendChild(h("span"));
          span._text = span.appendChild(document.createTextNode(""));
          slot.badges.push(span);
        }
        const cls = "cx-badge cx-tone-" + (badge.tone || "neutral");
        if (span._cls !== cls) {
          span.className = cls;
          span._cls = cls;
        }
        if (span._text.data !== badge.text) {
          span._text.data = badge.text;
        }
        const title = badge.title || null;
        if (span._title !== title) {
          if (title) {
            span.title = title;
          } else {
            span.removeAttribute("title");
          }
          span._title = title;
        }
      }
      while (slot.badges.length > count) {
        slot.badges.pop().remove();
      }
    },

    cell(rowEl, index, width, kind) {
      const cell = h("div", "cx-cell" + (kind ? " cx-kind-" + kind : ""));
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-colindex", String(index + 1));
      cell.style.width = width + "px";
      rowEl.appendChild(cell);
      return cell;
    }
  });

  // ---------- tree grid: detail rows ----------
  const detailColumn = { kind: "text" };

  function detailCell(tag, cell, lang) {
    const element = h(tag);
    setText(element, cellText(cell, detailColumn, lang));
    if (isCellObject(cell)) {
      if (cell.tone) {
        element.className = "cx-tone-" + cell.tone;
      }
      if (cell.title) {
        element.title = cell.title;
      }
      (cell.badges || []).forEach((badge) => {
        const span = h("span", "cx-badge cx-tone-" + (badge.tone || "neutral"));
        setText(span, badge.text);
        if (badge.title) span.title = badge.title;
        element.appendChild(span);
      });
    }
    return element;
  }

  Object.assign(TreeGrid.prototype, {
    /** Fills a detail row with its table, property list, or trusted host markup; a host callback can take over. */
    renderDetail(node, element) {
      if (this.opts.renderDetail && this.opts.renderDetail(node, element) === true) {
        return;
      }
      const detail = node.detail;
      const body = h("div", "cx-detail-body");
      if (detail.type === "table") {
        const table = h("table", "cx-detail-table");
        if (detail.caption) {
          const caption = h("caption");
          setText(caption, detail.caption);
          table.appendChild(caption);
        }
        const head = h("thead");
        const headRow = h("tr");
        (detail.columns || []).forEach((title) => {
          const th = h("th");
          th.scope = "col";
          setText(th, title);
          headRow.appendChild(th);
        });
        head.appendChild(headRow);
        table.appendChild(head);
        const tbody = h("tbody");
        (detail.rows || []).forEach((row) => {
          const tr = h("tr");
          row.forEach((cell) => tr.appendChild(detailCell("td", cell, this.lang)));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        body.appendChild(table);
      } else if (detail.type === "properties") {
        const list = h("dl", "cx-props");
        (detail.items || []).forEach((item) => {
          const term = h("dt");
          setText(term, item.name);
          list.appendChild(term);
          list.appendChild(detailCell("dd", item.value, this.lang));
        });
        body.appendChild(list);
      } else if (detail.type === "html") {
        body.innerHTML = detail.html; // trusted host markup, see docs/data-protocol.md
      }
      element.appendChild(body);
    }
  });

  // ---------- tree grid: keyboard ----------
  // Row-focus model: Up/Down move, Right expands then enters, Left collapses then goes to the parent, Home/End,
  // PageUp/PageDown, Enter toggles and selects, Space selects (toggles with multi-select), Shift extends a multi-select,
  // printable keys run type-ahead on labels. Tab leaves the grid.
  Object.assign(TreeGrid.prototype, {
    onKey(e) {
      if (e.target.closest("input,textarea,select,button,a")) {
        return;
      }
      const w = this.focused || this.rows[0];
      if (!w) {
        return;
      }
      const i = this.indexOf(w);
      const pageRows = Math.max(1, Math.floor((this.grid.clientHeight - this.head.offsetHeight) / this.rowH) - 1);
      const last = this.rows.length - 1;
      // A space inside a running type-ahead term continues the term ("lab c").
      const key = e.key === " " && this.typeBuf && performance.now() - this.typeAt <= TYPEAHEAD_MS ? "typeahead" : e.key;
      let target = null;
      let handled = true;
      switch (key) {
        case "ArrowDown": target = this.rows[Math.min(last, i + 1)]; break;
        case "ArrowUp": target = this.rows[Math.max(0, i - 1)]; break;
        case "PageDown": target = this.rows[Math.min(last, i + pageRows)]; break;
        case "PageUp": target = this.rows[Math.max(0, i - pageRows)]; break;
        case "Home": target = this.rows[0]; break;
        case "End": target = this.rows[last]; break;
        case "ArrowRight":
          if (!w.status && this.expandable(w)) {
            if (!w._open) {
              this.toggle(w, true);
            } else if (this.rows[i + 1] && this.rows[i + 1].parent === w) {
              target = this.rows[i + 1];
            }
          }
          break;
        case "ArrowLeft":
          if (!w.status && w._open) {
            this.toggle(w, false);
          } else if (w.parent && w.parent !== this.root) {
            target = w.parent;
          }
          break;
        case "Enter":
        case " ":
          this.activate(w, key === "Enter");
          break;
        default:
          handled = this.typeAhead(e, i);
      }
      if (target) {
        this.setFocus(target);
        if (!target.status && this.multi && e.shiftKey && /^(Arrow(Up|Down)|Page(Up|Down)|Home|End)$/.test(key)) {
          this.selectRange(target);
        }
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },

    /** Enter or Space on a row: retry, show more, or select (and with Enter, toggle). */
    activate(w, enter) {
      if (w.status === "more") {
        this.loadMore(w.parent);
      } else if (w.status === "error") {
        this.retryPage(w);
      } else if (!w.status) {
        if (this.multi && !enter) {
          this.select(w, { toggle: true });
        } else {
          this.select(w);
        }
        if (enter && this.expandable(w)) {
          this.toggle(w);
        }
      }
    },

    typeAhead(e, i) {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) {
        return false;
      }
      const now = performance.now();
      const letter = e.key.toLowerCase();
      this.typeBuf = now - this.typeAt > TYPEAHEAD_MS ? letter : this.typeBuf + letter;
      this.typeAt = now;
      const n = this.rows.length;
      const start = this.typeBuf.length === 1 ? i + 1 : i;
      for (let k = 0; k < n; k++) {
        const w = this.rows[(start + k) % n];
        if (!w.status && String(w.h.label).toLowerCase().startsWith(this.typeBuf)) {
          this.setFocus(w);
          break;
        }
      }
      return true;
    },

    announce(message) {
      setText(this.live, message);
    }
  });

  // ---------- tree grid: behavior ----------
  Object.assign(TreeGrid.prototype, {
    /** Opens or closes a node, judged by what the user sees: a filter can show a node open that was never expanded. */
    async toggle(w, expand) {
      if (this.destroyed || !w || w.status || !this.expandable(w)) {
        return;
      }
      const open = !!w._open;
      const want = expand === undefined ? !open : expand;
      if (want === open && (!want || w.children)) {
        return;
      }
      w.expanded = want;
      const revision = w.toggleRevision = (w.toggleRevision || 0) + 1;
      w.filterCollapsed = !want && !!this.filter;
      w._v = 0;
      if (want && !w.children) {
        await this.loadPage(w, null);
      } else {
        this.relayout();
      }
      if (this.destroyed || w.toggleRevision !== revision) return;
      this.emit("toggle", { node: w.h, expanded: w.expanded });
      if (this.opts.onToggle) {
        this.opts.onToggle(w.h, want);
      }
      this.stateChanged();
    },

    /** Loads the first page (cursor null) or the next page of a node's children, or of the top level. */
    loadPage(w, cursor) {
      if (this.destroyed) return Promise.resolve();
      if (w.loading) {
        return w._pending;
      }
      w.loading = true;
      w.error = null;
      w._v = 0;
      this.relayout();
      const started = performance.now();
      const run = (async () => {
        try {
          const inlineItems = w === this.root ? this.root.inlineItems : w.inline ? w.h.children : null;
          const page = inlineItems ? slicePage(inlineItems, cursor, this.pageSize) : await this.source.page(w === this.root ? null : w.h, cursor);
          if (this.destroyed) return;
          const items = page.items || [];
          if (!cursor || !w.children) {
            w.children = [];
          }
          const base = w.children.length;
          items.forEach((node, i) => w.children.push(this.wrap(node, w, base + i)));
          w.total = typeof page.total === "number" ? page.total : page.next ? null : w.children.length;
          w.next = page.next || null;
          this.applySort(w, false);
          // Rows already painted show the old set size; repaint every sibling.
          w.children.forEach((child) => { child._v = 0; });
          const loaded = w.children.length;
          const format = numberFormat(this.lang);
          this.announce(w.total != null && loaded < w.total ? format.format(loaded) + " of " + format.format(w.total) + " loaded" : format.format(loaded) + " items");
          const info = { node: w.h, count: items.length, total: w.total, ms: performance.now() - started };
          this.emit("load", info);
          if (this.opts.onLoad) {
            this.opts.onLoad(w.h, info);
          }
        } catch (err) {
          if (this.destroyed) return;
          w.error = err && err.message ? err.message : String(err);
          this.emit("error", { node: w.h, message: w.error });
        } finally {
          w.loading = false;
          w._v = 0;
          w._pending = null;
          this.relayout();
        }
        if (!this.destroyed && !w.error) {
          await this.expandInitial(w);
        }
      })();
      w._pending = run;
      return run;
    },

    async loadMore(w) {
      if (w.children && w.next) {
        const previous = new Set(w.children);
        const focus = this.focused;
        const element = document.activeElement;
        const revision = this.focusRevision || 0;
        const hadFocus = !!(focus && focus.status === "more" && focus.parent === w && element && element._w === focus);
        await this.loadPage(w, w.next);
        const next = w.children.find((child) => !previous.has(child));
        if (!this.destroyed && next && hadFocus && (this.focusRevision || 0) === revision &&
            (document.activeElement === element || document.activeElement === document.body)) {
          this.setFocus(next, true);
        }
      }
    },

    async retryPage(status) {
      const parent = status.parent;
      const previous = new Set(parent.children || []);
      const element = document.activeElement;
      const revision = this.focusRevision || 0;
      const owned = this.focused === status && element && element._w === status;
      await this.loadPage(parent, parent.next && previous.size ? parent.next : null);
      if (this.destroyed || !owned || (this.focusRevision || 0) !== revision ||
          (document.activeElement !== element && document.activeElement !== document.body)) return;
      const target = parent.error ? this.statusRow(parent, "error") :
        (parent.children || []).find((child) => !previous.has(child)) ||
        (parent.next ? this.statusRow(parent, "more") : parent !== this.root ? parent : this.rows[0]);
      if (target) this.setFocus(target, true);
      else this.grid.focus();
    },

    /** Selects a row. Options: toggle (Ctrl/Cmd or Space with multi-select), range (Shift). */
    select(w, options) {
      if (!w || w.status) {
        return;
      }
      const o = options || {};
      const previous = Array.from(this.selected);
      if (this.multi && o.range && this.anchor) {
        this.selectRange(w);
        return;
      }
      if (this.multi && o.toggle) {
        if (this.selected.has(w)) {
          this.selected.delete(w);
        } else {
          this.selected.add(w);
        }
      } else {
        this.selected = new Set([w]);
      }
      this.anchor = w;
      previous.forEach((p) => { p._v = 0; });
      w._v = 0;
      this.selectionChanged(w);
    },

    selectRange(w) {
      const from = this.indexOf(this.anchor);
      const to = this.indexOf(w);
      if (from < 0 || to < 0) {
        this.select(w);
        return;
      }
      this.selected.forEach((p) => { p._v = 0; });
      this.selected = new Set();
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
        if (!this.rows[i].status) {
          this.selected.add(this.rows[i]);
          this.rows[i]._v = 0;
        }
      }
      this.selectionChanged(w);
    },

    selectionChanged(w) {
      this.scheduleRender();
      const nodes = Array.from(this.selected).map((s) => s.h);
      this.emit("select", { node: w.h, nodes: nodes });
      if (this.opts.onSelect) {
        this.opts.onSelect(w.h, nodes);
      }
      this.writeDeepLink(w);
    },

    setFocus(w, domFocus) {
      if (!w) {
        return;
      }
      const previous = this.focused;
      this.focusRevision = (this.focusRevision || 0) + 1;
      this.focused = w;
      if (previous && previous !== w) {
        previous._v = 0;
      }
      this.ensureVisible(w);
      this.render();
      const rowEl = this.rendered.get(w);
      if (rowEl && domFocus !== false) {
        rowEl.focus({ preventScroll: true });
      }
    },

    ensureVisible(w) {
      const i = this.indexOf(w);
      if (i < 0) {
        return;
      }
      const grid = this.grid;
      const y = this.tops[i];
      const height = w.span * this.rowH;
      const viewHeight = grid.clientHeight - this.head.offsetHeight;
      if (y < grid.scrollTop) {
        grid.scrollTop = y;
      } else if (y + height > grid.scrollTop + viewHeight) {
        grid.scrollTop = y + height - viewHeight;
      }
    },

    rowFromEvent(e) {
      const rowEl = e.target.closest(".cx-row");
      return rowEl && rowEl._w ? rowEl._w : null;
    },

    onClick(e) {
      const w = this.rowFromEvent(e);
      if (!w) {
        return;
      }
      if (w.status) {
        this.setFocus(w, true);
        this.activate(w, true);
        return;
      }
      if (w.h.detail) {
        const interactive = e.target.closest("a,button,input,select,textarea,[contenteditable]");
        this.setFocus(w, !interactive);
        if (!interactive) this.select(w, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
        return;
      }
      this.setFocus(w, true);
      if (e.target.classList.contains("cx-exp")) {
        this.toggle(w);
      } else {
        this.select(w, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
      }
    },

    onDblClick(e) {
      const w = this.rowFromEvent(e);
      if (w && !w.status && !e.target.classList.contains("cx-exp")) {
        this.toggle(w);
      }
    },

    /** Opens a node for expandPath and throws when its children cannot be loaded. */
    async openForPath(w) {
      if (this.destroyed) return;
      w.expanded = true;
      w.filterCollapsed = false;
      w._v = 0;
      if (!w.children) {
        await this.loadPage(w, null);
        if (!w.children) {
          throw new Error("CanopyX: could not load the children of '" + w.key + "': " + (w.error || "no data"));
        }
      }
    },

    /**
     * Expands the tree along an id path, paging through "show more" until each id is loaded. Options: select and
     * focus (default true), reveal (scroll to the node, default true), expandLast (also open the last node).
     */
    async expandPath(ids, options) {
      const o = options || {};
      await this.rootsReady;
      if (this.destroyed) return null;
      let parent = this.root;
      let w = null;
      for (let k = 0; k < ids.length; k++) {
        if (parent !== this.root) {
          await this.openForPath(parent);
        }
        if (this.destroyed) return null;
        w = this.keyMap.get(ids[k]);
        while ((!w || w.parent !== parent) && parent.children && parent.next) {
          const before = parent.children.length;
          await this.loadPage(parent, parent.next);
          if (this.destroyed) return null;
          if (parent.error || parent.children.length === before) {
            throw new Error("CanopyX: could not load more children of '" + (parent.key || "the top level") + "': " + (parent.error || "no progress"));
          }
          w = this.keyMap.get(ids[k]);
        }
        if (!w || w.parent !== parent) {
          throw new Error("CanopyX: id not found on the path: " + ids[k]);
        }
        parent = w;
      }
      if (o.expandLast && w && this.expandable(w)) {
        await this.openForPath(w);
      }
      if (this.destroyed) return null;
      if (w && o.reveal !== false && this.filter && this.matchState(w) === 0) {
        this.activeFilters.clear();
        this.toolbar.querySelectorAll("[data-cx-filter]").forEach((input) => { input.checked = false; });
        this.setFilter(null);
      }
      this.relayout();
      this.stateChanged();
      if (w && o.select !== false) {
        this.select(w);
      }
      if (w && o.focus !== false) {
        this.setFocus(w, true);
      } else if (w && o.reveal !== false) {
        this.ensureVisible(w);
      }
      return w ? w.h : null;
    },

    /** Sets a filter: a predicate over nodes, or { match, keep } for ancestor hints; null clears it. */
    setFilter(filter, options) {
      this.filter = typeof filter === "function" ? { match: filter } : filter || null;
      this.filterExpand = !!(options && options.autoExpand);
      this.keyMap.forEach((w) => { w.filterCollapsed = false; });
      this.version++;
      this.relayout();
    },

    /** Turns a declarative flag filter from the view on or off; active filters must all match. */
    setFilterActive(id, active) {
      if (active) {
        this.activeFilters.add(id);
      } else {
        this.activeFilters.delete(id);
      }
      const input = this.toolbar.querySelector("[data-cx-filter=\"" + CSS.escape(id) + "\"]");
      if (input) {
        input.checked = !!active;
      }
      const filters = (this.view.filters || []).filter((f) => this.activeFilters.has(f.id));
      const has = (node, flag) => !!(flag && node.flags && node.flags.indexOf(flag) >= 0);
      this.setFilter(filters.length ? {
        match: (node) => filters.every((f) => has(node, f.flag)),
        keep: (node) => filters.every((f) => has(node, f.flag) || has(node, f.ancestorFlag))
      } : null, { autoExpand: true });
    },

    sort(columnId, direction) {
      this.sortState = direction ? { column: columnId, direction: direction } : null;
      this.buildHeader();
      this.applySort(this.root, true);
      this.version++;
      this.relayout();
    },

    setColumnVisible(columnId, visible) {
      const index = this.columns.findIndex((c) => c.id === columnId);
      if (index <= 0) {
        return;
      }
      this.columns[index].hidden = !visible;
      const input = this.toolbar.querySelector("[data-cx-column=\"" + CSS.escape(columnId) + "\"]");
      if (input) {
        input.checked = !!visible;
      }
      this.buildHeader();
      this.relayout();
    }
  });

  // ---------- tree grid: toolbar (search box, filter switches, column chooser) ----------
  Object.assign(TreeGrid.prototype, {
    buildToolbar() {
      const bar = this.toolbar;
      let any = false;
      if (this.view.search && this.source.canSearch) {
        this.buildSearch(bar, this.view.search);
        any = true;
      }
      (this.view.filters || []).forEach((filter) => {
        const label = h("label", "cx-switch");
        const input = h("input");
        input.type = "checkbox";
        input.setAttribute("data-cx-filter", filter.id);
        input.addEventListener("change", () => this.setFilterActive(filter.id, input.checked));
        label.appendChild(input);
        label.appendChild(document.createTextNode(filter.label));
        bar.appendChild(label);
        any = true;
      });
      if (this.columns.length > 1) {
        this.buildColumnChooser(bar);
        any = true;
      }
      bar.hidden = !any;
    },

    /** Combobox search: typing lists hits, arrows move through them, Enter expands the tree to the chosen hit. */
    buildSearch(bar, options) {
      const box = h("div", "cx-search");
      const input = h("input", "cx-search-input");
      const list = h("ul", "cx-results");
      const status = h("span", "cx-sr-only");
      list.id = this.id + "-results";
      list.hidden = true;
      list.setAttribute("role", "listbox");
      list.setAttribute("aria-label", "Search results");
      input.type = "search";
      input.placeholder = options.placeholder || "Search";
      input.setAttribute("aria-label", options.placeholder || "Search");
      input.setAttribute("role", "combobox");
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-expanded", "false");
      input.setAttribute("aria-controls", list.id);
      status.setAttribute("aria-live", "polite");
      let timer = 0;
      let blurTimer = 0;
      let sequence = 0;
      let hits = [];
      let active = -1;
      const close = () => {
        list.hidden = true;
        active = -1;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
      };
      const choose = async (index) => {
        const hit = hits[index];
        if (!hit) {
          return;
        }
        close();
        try {
          await this.expandPath(hit.path, { select: true, focus: true });
        } catch (err) {
          setText(status, err.message);
        }
      };
      const show = (result) => {
        hits = result.hits || [];
        list.textContent = "";
        hits.forEach((hit, index) => {
          const item = h("li", "cx-result");
          item.id = list.id + "-" + index;
          item.setAttribute("role", "option");
          item.setAttribute("aria-selected", "false");
          const label = h("span", "cx-result-label");
          setText(label, hit.label);
          item.appendChild(label);
          if (hit.kind) {
            const kind = h("span", "cx-result-kind");
            setText(kind, hit.kind);
            item.appendChild(kind);
          }
          if (hit.context) {
            const context = h("span", "cx-result-context");
            setText(context, hit.context);
            item.appendChild(context);
          }
          item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            choose(index);
          });
          list.appendChild(item);
        });
        list.hidden = !hits.length;
        input.setAttribute("aria-expanded", hits.length ? "true" : "false");
        setText(status, hits.length ? hits.length + (result.truncated ? " of " + (result.total || "many") : "") + " results" : "No results");
      };
      const run = async () => {
        if (this.destroyed) return;
        const query = input.value.trim();
        if (query.length < options.minLength) {
          sequence++;
          close();
          setText(status, query ? "Type at least " + options.minLength + " characters" : "");
          return;
        }
        const mine = ++sequence;
        try {
          const result = await this.source.search(query, options.maxResults);
          if (!this.destroyed && mine === sequence) {
            show(result);
          }
        } catch (err) {
          if (!this.destroyed && mine === sequence) {
            setText(status, "Search failed: " + (err && err.message ? err.message : err));
          }
        }
      };
      const move = (delta) => {
        if (list.hidden || !hits.length) {
          return;
        }
        if (active >= 0) {
          list.children[active].setAttribute("aria-selected", "false");
        }
        active = (active + delta + hits.length) % hits.length;
        const item = list.children[active];
        item.setAttribute("aria-selected", "true");
        input.setAttribute("aria-activedescendant", item.id);
        item.scrollIntoView({ block: "nearest" });
      };
      input.addEventListener("input", () => {
        sequence++;
        // Results for the previous text are stale as soon as the text changes; Enter waits for the new ones.
        clearTimeout(timer);
        hits = [];
        close();
        timer = setTimeout(run, 150);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          move(e.key === "ArrowDown" ? 1 : -1);
        } else if (e.key === "Enter") {
          if (!list.hidden) {
            choose(active >= 0 ? active : 0);
          }
        } else if (e.key === "Escape") {
          sequence++;
          clearTimeout(timer);
          if (list.hidden) {
            input.value = "";
          }
          close();
        } else {
          return;
        }
        e.preventDefault();
      });
      input.addEventListener("blur", () => { clearTimeout(blurTimer); blurTimer = setTimeout(close, 150); });
      this.cancelSearch = () => { sequence++; clearTimeout(timer); clearTimeout(blurTimer); };
      box.appendChild(input);
      box.appendChild(list);
      box.appendChild(status);
      bar.appendChild(box);
      this.searchInput = input;
    },

    /** A native disclosure with one checkbox per hideable column; the tree column always stays. */
    buildColumnChooser(bar) {
      const details = h("details", "cx-columns");
      const summary = h("summary");
      setText(summary, "Columns");
      const group = h("fieldset", "cx-columns-list");
      const legend = h("legend", "cx-sr-only");
      setText(legend, "Visible columns");
      group.appendChild(legend);
      this.columns.slice(1).forEach((column) => {
        const label = h("label");
        const input = h("input");
        input.type = "checkbox";
        input.checked = !column.hidden;
        input.setAttribute("data-cx-column", column.id);
        input.addEventListener("change", () => this.setColumnVisible(column.id, input.checked));
        label.appendChild(input);
        label.appendChild(document.createTextNode(column.title));
        group.appendChild(label);
      });
      details.appendChild(summary);
      details.appendChild(group);
      bar.appendChild(details);
    }
  });

  // ---------- tree grid: remembered state, deep links, outline, counts ----------
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  Object.assign(TreeGrid.prototype, {
    pathOf(w) {
      const path = [];
      for (let node = w; node && node !== this.root; node = node.parent) {
        path.unshift(node.key);
      }
      return path;
    },

    getExpandedPaths() {
      const out = [];
      const walk = (w) => {
        for (const child of w.children || []) {
          if (child.expanded && child.children) {
            out.push(this.pathOf(child));
            walk(child);
          }
        }
      };
      walk(this.root);
      return out;
    },

    async setState(state) {
      if (this.destroyed || !state || !Array.isArray(state.expanded)) {
        return;
      }
      this.restoring = true;
      try {
        this.keyMap.forEach((w) => { w.expanded = false; w.autoExpand = false; w._v = 0; });
        this.relayout();
        const paths = state.expanded.slice().sort((a, b) => a.length - b.length);
        for (const path of paths) {
          if (this.destroyed) break;
          try {
            await this.expandPath(path, { select: false, focus: false, reveal: false, expandLast: true });
          } catch (e) {
            // A remembered node may no longer exist.
          }
        }
      } finally {
        this.restoring = false;
      }
    },

    stateKey() {
      return this.view.stateKey ? "canopyx:" + this.view.stateKey : null;
    },

    stateChanged() {
      const key = this.stateKey();
      if (this.destroyed || !key || this.restoring) {
        return;
      }
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        if (this.destroyed) return;
        try {
          sessionStorage.setItem(key, JSON.stringify({ expanded: this.getExpandedPaths() }));
        } catch (e) {
          // Storage can be unavailable (private mode, blocked storage).
        }
      }, 250);
    },

    async restoreState() {
      const key = this.stateKey();
      if (!key) {
        return;
      }
      let state = null;
      try {
        state = JSON.parse(sessionStorage.getItem(key) || "null");
      } catch (e) {
        state = null;
      }
      await this.setState(state);
    },

    deepLinkName() {
      return "cx." + encodeURIComponent(this.view.id);
    },

    hashParams() {
      return (global.location.hash || "").replace(/^#/, "").split("&").filter(Boolean);
    },

    async openDeepLink() {
      if (!this.view.deepLink) {
        return;
      }
      const prefix = this.deepLinkName() + "=";
      const param = this.hashParams().find((p) => p.startsWith(prefix));
      if (!param) {
        return;
      }
      try {
        const ids = param.slice(prefix.length).split("/").filter(Boolean).map(decodeURIComponent);
        await this.expandPath(ids, { select: true, focus: false });
      } catch (e) {
        this.announce(e.message);
      }
    },

    writeDeepLink(w) {
      if (!this.view.deepLink) {
        return;
      }
      const prefix = this.deepLinkName() + "=";
      const params = this.hashParams().filter((p) => !p.startsWith(prefix));
      params.push(prefix + this.pathOf(w).map(encodeURIComponent).join("/"));
      const hash = "#" + params.join("&");
      try {
        global.history.replaceState(global.history.state, "", hash);
      } catch (e) {
        global.location.hash = hash;
      }
    },

    visibleRows() {
      return this.rows.filter((w) => !w.status).map((w) => ({ node: w.h, level: w.level, path: this.pathOf(w) }));
    },

    /** An indented outline table of the rows that are open, for print and hosts that export what the user sees. */
    toOutline() {
      const cols = this.visibleColumns();
      const out = ["<table class=\"cx-outline-table\"><thead><tr>"];
      cols.forEach((column) => out.push("<th>" + escapeHtml(column.title) + "</th>"));
      out.push("</tr></thead><tbody>");
      this.rows.forEach((w) => {
        if (w.status) {
          return;
        }
        const pad = " style=\"padding-left:" + ((w.level - 1) * 14 + 4) + "px\"";
        if (w.h.detail) {
          const detail = w.h.detail;
          const content = h("div");
          this.renderDetail(w.h, content);
          out.push("<tr><td" + pad + " colspan=\"" + cols.length + "\">" + content.innerHTML + "</td></tr>");
          return;
        }
        out.push("<tr>");
        cols.forEach((column, i) => {
          const index = this.columns.indexOf(column);
          const value = this.cellOf(w.h, column, index);
          const text = cellText(value, column, this.lang);
          const content = detailCell("span", isCellObject(value) ? Object.assign({}, value, { text }) : { text }, this.lang);
          if (i === 0) (w.h.badges || []).forEach((badge) => content.appendChild(detailCell("span", { text: "", badges: [badge] }, this.lang)));
          out.push("<td" + (i === 0 ? pad : "") + ">" + content.outerHTML + "</td>");
        });
        out.push("</tr>");
      });
      out.push("</tbody></table>");
      return out.join("");
    },

    /** Applies a counts document to loaded nodes: child counts, rollup cells, and flags. */
    applyCounts(doc) {
      if (this.destroyed) return;
      checkDocument(doc, "counts");
      (doc.items || []).forEach((item) => {
        const w = this.keyMap.get(item.id);
        if (!w) {
          return;
        }
        if (typeof item.childCount === "number") {
          w.h.childCount = item.childCount;
          w.total = item.childCount;
          if (!w.inline) {
            w.h.hasChildren = item.childCount > 0;
            if (item.childCount > 0 && w.children && !w.children.length) w.children = null;
            if (!item.childCount && (!w.children || !w.children.length)) w.expanded = false;
          }
        }
        if (item.cells) {
          w.h.cells = Object.assign({}, w.h.cells, item.cells);
        }
        if (Array.isArray(item.flags)) {
          w.h.flags = item.flags.slice();
        }
      });
      this.version++;
      this.applySort(this.root, true);
      this.relayout();
    },

    async refreshCounts(ids) {
      if (this.destroyed || !this.source.counts) {
        return null;
      }
      const wanted = ids || this.rows.filter((w) => !w.status).map((w) => w.key);
      const revisions = this.countRevisions || (this.countRevisions = new Map());
      const mine = new Map(wanted.map((id) => [id, (revisions.get(id) || 0) + 1]));
      mine.forEach((revision, id) => revisions.set(id, revision));
      const doc = await this.source.counts(wanted);
      if (this.destroyed) return null;
      checkDocument(doc, "counts");
      this.applyCounts(Object.assign({}, doc, { items: (doc.items || []).filter((item) => mine.has(item.id) && mine.get(item.id) === revisions.get(item.id)) }));
      return doc;
    },

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      clearTimeout(this.saveTimer);
      if (this.cancelSearch) this.cancelSearch();
      cancelAnimationFrame(this.rafId);
      this.resizeObserver.disconnect();
      this.grid.removeEventListener("scroll", this.onScroll);
      global.removeEventListener("beforeprint", this.onPrint);
      [this.toolbar, this.grid, this.live, this.outline].forEach((element) => element.remove());
      this.host.removeAttribute("data-cx-ready");
      this.host.removeAttribute("data-canopyx-mounted");
    }
  });

  // ---------- public API and auto-mount ----------
  /**
   * Creates a tree grid in a host element.
   * @param {HTMLElement} host The element that receives the grid.
   * @param {{ view: object, source?: object, renderCell?: Function, renderDetail?: Function,
   *           onSelect?: Function, onToggle?: Function, onLoad?: Function }} options
   *   `view` is a canopyx/1 view document. Callbacks are optional; the same events are also dispatched on the host
   *   as canopyx:select, canopyx:toggle, canopyx:load, canopyx:error, and canopyx:ready.
   *   renderCell(node, columnId, element, context) returns true when it drew the cell itself; context.index is the
   *   column's position in view.columns. renderDetail(node, element) returns true when it drew the detail row.
   */
  function createTreeGrid(host, options) {
    if (!host || !options || !options.view) {
      throw new Error("CanopyX: createTreeGrid needs a host element and a view document.");
    }
    const grid = new TreeGrid(host, options);
    const api = Object.freeze({
      element: host,
      view: grid.view,
      ready: grid.ready,
      expandPath: (ids, o) => grid.expandPath(ids, o),
      setFilter: (filter, o) => grid.setFilter(filter, o),
      setFilterActive: (id, active) => grid.setFilterActive(id, active),
      sort: (columnId, direction) => grid.sort(columnId, direction),
      setColumnVisible: (columnId, visible) => grid.setColumnVisible(columnId, visible),
      refresh: () => { grid.version++; grid.scheduleRender(); },
      getSelected: () => Array.from(grid.selected).map((w) => w.h),
      focus: () => grid.setFocus(grid.focused || grid.rows[0], true),
      visibleRows: () => grid.visibleRows(),
      toOutline: () => grid.toOutline(),
      getState: () => ({ expanded: grid.getExpandedPaths() }),
      setState: (state) => grid.setState(state),
      search: (query, limit) => grid.source.search(query, limit || (grid.view.search && grid.view.search.maxResults) || 20),
      loadMore: (id) => {
        const w = id == null ? grid.root : grid.keyMap.get(id);
        return w ? grid.loadMore(w) : Promise.resolve();
      },
      applyCounts: (doc) => grid.applyCounts(doc),
      refreshCounts: (ids) => grid.refreshCounts(ids),
      destroy: () => grid.destroy()
    });
    host.canopyx = api;
    return api;
  }

  /** Mounts every [data-canopyx-host] element under root that has a JSON configuration script. */
  function mount(root) {
    const scope = root || document;
    const created = [];
    scope.querySelectorAll("[data-canopyx-host]:not([data-canopyx-mounted])").forEach((host) => {
      const config = host.querySelector("script.cx-config");
      if (!config) {
        return;
      }
      host.setAttribute("data-canopyx-mounted", "true");
      try {
        created.push(createTreeGrid(host, { view: JSON.parse(config.textContent) }));
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        const notice = document.createElement("div");
        notice.className = "cx-mount-error";
        notice.setAttribute("role", "alert");
        setText(notice, "This view could not be displayed: " + message);
        host.classList.add("cx-host");
        host.setAttribute("data-cx-error", message);
        host.appendChild(notice);
        if (global.console) {
          global.console.error(err);
        }
      }
    });
    return created;
  }

  global.CanopyX = Object.freeze({
    protocol: PROTOCOL,
    createTreeGrid: createTreeGrid,
    mount: mount,
    sources: Object.freeze({ inline: inlineSource, sidecar: sidecarSource, remote: remoteSource })
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(document));
  } else {
    mount(document);
  }
})(typeof window !== "undefined" ? window : this);
