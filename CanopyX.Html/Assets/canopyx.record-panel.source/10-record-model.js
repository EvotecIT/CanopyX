  // ---------- record panel: fields, layout and record payloads ----------
  // A record shows the view's columns (except drawer: false; the identity column titles the drawer) and the record-only
  // fields of view.record.fields, whose values a row or node carries in "fields" or a payload loads when the drawer opens.
  // Any value may be structured: a list (items), an object (fields), a collection of records (records), a timeline (events)
  // or before/after changes (changes); any value may link to another record (ref). docs/record-panel.md has the contract.
  const RECORD_KINDS = ["items", "fields", "records", "events", "changes"], RECORD_LINK_KEY = /^[A-Za-z][\w.-]{0,31}$/, RECORD_MAX_STRUCTURE_DEPTH = 8;
  const recordKind = cell => {
    const kinds = isCellObject(cell) && !Array.isArray(cell) ? RECORD_KINDS.filter(name => cell[name] !== undefined) : [];
    if (kinds.length > 1) recordFail("a cell carries at most one structured value.");
    return kinds[0] || null;
  };
  const recordFail = message => { throw new Error("CanopyX: " + message); };
  const recordText = (value, max = 256) => typeof value === "string" && !!value.trim() && value.length <= max;
  const recordGridHelpers = () => RECORD_IMPL.grid || {};
  function recordCheckValue(cell, depth = 0) {
    if (cell == null) return;
    if (depth > RECORD_MAX_STRUCTURE_DEPTH) recordFail("structured values nest at most " + RECORD_MAX_STRUCTURE_DEPTH + " levels.");
    const kind = recordKind(cell);
    if (kind === "items") for (const item of cell.items || []) recordCheckValue(item, depth + 1);
    if (kind === "fields") for (const field of cell.fields || []) recordCheckValue(field.value, depth + 1);
    if (kind === "changes") for (const change of cell.changes || []) { recordCheckValue(change.before, depth + 1); recordCheckValue(change.after, depth + 1); }
    if (kind === "events") for (const event of cell.events || []) for (const change of event.changes || []) {
      recordCheckValue(change.before, depth + 1); recordCheckValue(change.after, depth + 1);
    }
    if (kind === "records") recordCheckRows(cell.records.rows || cell.records.roots, depth + 1);
  }
  // A collection/detail adds a structured level; ordinary tree ancestors do not. Keep the hierarchy walk iterative,
  // as in Core's tree validator, and carry the enclosing value depth through every row's cells, fields and details.
  function recordCheckRows(rows, depth) {
    const pending = [...rows || []], seen = new Set();
    while (pending.length) {
      const row = pending.pop();
      if (!row || seen.has(row)) continue;
      seen.add(row);
      for (const cells of [row.cells, row.fields]) if (cells) Object.values(cells).forEach(cell => recordCheckValue(cell, depth));
      const detail = row.detail;
      if (detail) {
        if (depth > RECORD_MAX_STRUCTURE_DEPTH) recordFail("structured values nest at most " + RECORD_MAX_STRUCTURE_DEPTH + " levels.");
        if (detail.type === "properties") for (const item of detail.items || []) recordCheckValue(item.value, depth);
        if (detail.type === "table") for (const cells of detail.rows || []) for (const cell of cells) recordCheckValue(cell, depth);
        if (detail.type === "grid" || detail.type === "tree") recordCheckRows(detail.rows || detail.roots, depth + 1);
      }
      for (const child of row.children || []) pending.push(child);
    }
  }

  // The view's record panel definition, checked once per view: ids, references, layout, deep links, source and actions.
  function recordSpec(view) {
    if (view._recordSpec) return view._recordSpec;
    const spec = view.view.record || {}, columns = new Set(view.columns.map(column => column.id)), fields = new Set(), sections = new Set();
    if (typeof spec !== "object" || Array.isArray(spec)) recordFail("a record panel is an object.");
    for (const field of spec.fields || []) {
      requireIdentifier(field?.id, "record field ID");
      if (field.id === "__proto__") recordFail("a record field cannot be named __proto__.");
      if (columns.has(field.id) || fields.has(field.id) || !recordText(field.title) || field.kind !== undefined && !["text", "number", "datetime"].includes(field.kind) ||
          field.section !== undefined && !recordText(field.section)) recordFail("record field " + field.id + " needs a unique id, a title and a text, number or datetime kind.");
      if (field.presenter !== undefined && recordGridHelpers().validatePresenter) recordGridHelpers().validatePresenter(field.presenter, { kind: "text", ...field }, view.columns);
      fields.add(field.id);
    }
    const known = id => columns.has(id) || fields.has(id), top = new Set();
    const walk = (list, depth) => {
      if (!Array.isArray(list) || depth > 2) recordFail("record sections are an array, nested at most three levels.");
      for (const section of list) {
        requireIdentifier(section?.id, "record section ID");
        if (sections.has(section.id) || !recordText(section.label) || section.fields !== undefined && (!Array.isArray(section.fields) || !section.fields.every(known)) ||
            section.renderer !== undefined && !/^[a-z][a-z0-9-]{0,31}$/.test(section.renderer) || section.collapsed !== undefined && typeof section.collapsed !== "boolean")
          recordFail("record section " + section.id + " needs a unique id, a label and declared fields.");
        sections.add(section.id); if (!depth) top.add(section.id); walk(section.sections || [], depth + 1);
      }
    };
    walk(spec.sections || [], 0);
    const tabs = new Set();
    for (const tab of spec.tabs || []) {
      requireIdentifier(tab?.id, "record tab ID");
      if (tabs.has(tab.id) || !recordText(tab.label) || !Array.isArray(tab.sections) || !tab.sections.every(id => top.has(id))) recordFail("record tab " + tab.id + " needs a unique id, a label and declared top-level sections.");
      tabs.add(tab.id);
    }
    const header = spec.header, link = spec.deepLink, source = spec.source;
    if (header !== undefined && (!header || header.facts !== undefined && (!Array.isArray(header.facts) || header.facts.length > 6 || !header.facts.every(known)) ||
        header.status !== undefined && !known(header.status))) recordFail("a record header names up to six declared facts and a declared status.");
    if (link !== undefined && link !== true && (!link || typeof link !== "object" || link.key !== undefined && !RECORD_LINK_KEY.test(link.key))) recordFail("a record deep link is true or { key }.");
    if (source !== undefined && (!source || !["inline", "host", "sidecar"].includes(source.kind) || source.kind === "sidecar" &&
        (typeof source.base !== "string" || !Number.isInteger(source.shards) || source.shards < 1 || source.shards > 65536))) recordFail("a record source is inline, host, or a sidecar with a base and 1 to 65,536 shards.");
    if (source?.kind === "sidecar" && (!source.base || /[?#]/.test(source.base)))
      recordFail("a record sidecar base must be a non-empty folder path without a query or fragment.");
    for (const name of ["hideEmpty", "jumpList"]) if (spec[name] !== undefined && typeof spec[name] !== "boolean") recordFail("record " + name + " is a boolean.");
    if (spec.actions !== undefined && (!spec.actions || Object.entries(spec.actions).some(([name, value]) => !["copy", "print", "export", "link"].includes(name) || typeof value !== "boolean")))
      recordFail("record actions switch copy, print, export and link on or off.");
    return view._recordSpec = spec;
  }

  const recordPrimary = view => view.kind === "tree" ? view.columns[0] : view.visibleColumns()[0];
  // Every field a record can show, in declaration order: the columns, then the record fields.
  function recordFields(view) {
    const spec = recordSpec(view), primary = recordPrimary(view), fields = [];
    view.columns.forEach((column, index) => {
      if (column.drawer === false || view.kind === "tree" && !index) return;
      fields.push({ id: column.id, title: column.title, kind: column.kind, presenter: column.presenter, wrap: column.wrap, section: column.section, column, primary: column === primary });
    });
    for (const field of spec.fields || []) fields.push({ ...field, kind: field.kind || "text", column: null, primary: false });
    return fields;
  }

  // A field's cell: the payload's, else the record's own.
  function recordCell(view, record, payload, field) {
    // Own values only: an id such as "constructor" never reads an inherited member.
    const own = (values, id) => values && Object.hasOwn(values, id) ? values[id] : undefined;
    if (!field.column) return own(payload?.fields, field.id) !== undefined ? own(payload.fields, field.id) : own(record.fields, field.id);
    if (own(payload?.cells, field.id) !== undefined) return own(payload.cells, field.id);
    return view.kind === "tree" ? view.cellOf(record, field.column, view.columns.indexOf(field.column)) : own(record.cells, field.id);
  }

  function recordEmpty(cell, field, fmt) {
    const kind = recordKind(cell);
    if (kind === "records") return !cell.records.rows?.length && !cell.records.roots?.length;
    if (kind) return !Array.isArray(cell[kind]) || !cell[kind].length;
    if (isCellObject(cell) && (cell.series?.length || cell.badges?.length)) return false;
    return cellText(cell, field, fmt) === "";
  }

  // Tabs of sections of fields. Without declared sections, fields group by their section label as in the plain drawer;
  // declared sections take the fields they list, and a trailing section keeps every other field. Sections no tab lists
  // join the last tab, so nothing a record carries is ever left out.
  function recordLayout(view, fields) {
    const spec = recordSpec(view), byId = new Map(fields.map(field => [field.id, field])), placed = new Set(), labels = view.labels;
    const section = (item, depth) => ({ id: item.id, label: item.label, depth, collapsed: !!item.collapsed, renderer: item.renderer || null,
      fields: (item.fields || []).map(id => byId.get(id)).filter(field => field && !placed.has(field.id) && placed.add(field.id)),
      sections: (item.sections || []).map(child => section(child, depth + 1)) });
    // The fields the pinned summary shows are placed there; every other field finds a section.
    const sections = (spec.sections || []).map(item => section(item, 0)), header = new Set([...(spec.header?.facts || []), spec.header?.status].filter(Boolean));
    // Without a record panel the drawer keeps the plain drawer's fields, the identity column too.
    const rest = fields.filter(field => !placed.has(field.id) && !(field.primary && view.view.record) && !header.has(field.id));
    if (!spec.sections) {
      const named = new Map();
      for (const field of rest) {
        const name = field.section || labels.gridDetailsSection;
        if (!named.has(name)) named.set(name, { id: "s" + named.size, label: name, depth: 0, fields: [], sections: [] });
        named.get(name).fields.push(field);
      }
      sections.push(...named.values());
    } else if (rest.length) sections.push({ id: "other", label: labels.recordOtherFields, depth: 0, fields: rest, sections: [] });
    const known = new Map(sections.map(item => [item.id, item]));
    const tabs = (spec.tabs || []).map(tab => ({ id: tab.id, label: tab.label, sections: tab.sections.map(id => known.get(id)).filter(Boolean) }));
    if (tabs.length) { const used = new Set(tabs.flatMap(tab => tab.sections)); tabs[tabs.length - 1].sections.push(...sections.filter(item => !used.has(item))); }
    return { tabs: tabs.length ? tabs : [{ id: "all", label: "", sections }], header: spec.header || null, byId,
      hideEmpty: !!view.view.record && spec.hideEmpty !== false, jump: spec.jumpList };
  }

  // ---------- payloads loaded on demand ----------
  // A record's details come from the host's loadRecord(request, { signal }) option, a hosted source's record(request, { signal })
  // hook, or the view's sidecar packs (records/r<shard>.js, loadable from file://). The request is a gridRecordQuery; the
  // answer a gridRecord with optional cells, fields and row. Payloads are cached per view (64 records, 16 sidecar packs).
  const RECORD_PACKS = new Map();
  function recordShard(id, shards) {
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
    return (hash >>> 0) % shards;
  }
  function recordLoader(view) {
    const source = recordSpec(view).source;
    if (typeof view.opts.loadRecord === "function") return view.opts.loadRecord;
    if (view.kind === "grid" && typeof view.source?.record === "function") return (request, options) => view.source.record(request, options);
    return source?.kind === "sidecar" ? "sidecar" : null;
  }
  function recordRevision(view) {
    if (view.kind === "grid") {
      if (!view.opts.source && view.view.source.kind === "inline") return null;
      return view.snapshot?.revision ?? null;
    }
    return view.datasetRevision ?? null;
  }
  const recordCacheKey = (view, id, revision = recordRevision(view)) => JSON.stringify([revision, id]);
  const recordEntry = (view, id) => view._recordPayloads?.get(recordCacheKey(view, id));
  // An accepted local save changes this record independently of the cache's query/revision key.
  // Removing the entry also detaches a late loading result; its promise never inserts itself back into the cache.
  RECORD_IMPL.invalidate = (view, id) => { view._recordPayloads?.delete(recordCacheKey(view, id)); };
  function recordPayload(view, id, doc, revision) {
    if (doc == null) return null;
    if (typeof doc !== "object" || Array.isArray(doc) || doc.protocol !== undefined && doc.protocol !== PROTOCOL || doc.type !== undefined && doc.type !== "gridRecord" ||
        doc.view !== undefined && doc.view !== view.view.id || doc.id !== undefined && doc.id !== id ||
        revision != null && doc.revision !== undefined && doc.revision !== revision) recordFail("a record source answers with the gridRecord of the requested record and revision.");
    for (const name of ["cells", "fields"]) if (doc[name] !== undefined && (!doc[name] || typeof doc[name] !== "object" || Array.isArray(doc[name]) || Object.hasOwn(doc[name], "__proto__")))
      recordFail("record " + name + " are an object of ids.");
    if (doc.row !== undefined && (!doc.row || doc.row.id !== id || !doc.row.cells || typeof doc.row.cells !== "object")) recordFail("a record's row is the requested record.");
    for (const cells of [doc.cells, doc.fields]) if (cells) Object.values(cells).forEach(cell => recordCheckValue(cell));
    if (doc.row) recordCheckRows([doc.row], 0);
    return JSON.parse(JSON.stringify({ cells: doc.cells || null, fields: doc.fields || null, row: doc.row || null }));
  }
  function recordFetch(view, id, extra, signal) {
    const loader = recordLoader(view), spec = recordSpec(view).source, revision = recordRevision(view);
    if (!loader) return Promise.resolve(null);
    if (loader === "sidecar") {
      const shard = recordShard(id, spec.shards), key = JSON.stringify([view.view.id, spec.base, shard]);
      let pack = RECORD_PACKS.get(key);
      if (!pack) {
        pack = loadSidecar(spec.base, view.view.id, "r" + shard).then(doc => {
          if (!doc || doc.protocol !== PROTOCOL || doc.type !== "gridRecordPack" || doc.view !== view.view.id || !Array.isArray(doc.records) || doc.records.some(item => !item || typeof item.id !== "string"))
            recordFail("record pack r" + shard + " is not a gridRecordPack of this view.");
          return new Map(doc.records.map(item => [item.id, item]));
        });
        pack.catch(() => RECORD_PACKS.delete(key)); RECORD_PACKS.set(key, pack);
        if (RECORD_PACKS.size > 16) RECORD_PACKS.delete(RECORD_PACKS.keys().next().value);
      }
      return pack.then(records => recordPayload(view, id, records.get(id) || null, revision));
    }
    const request = { protocol: PROTOCOL, type: "gridRecordQuery", view: view.view.id, id,
      ...(revision != null ? { revision } : {}), ...extra };
    const run = signal => Promise.resolve(loader(request, { signal }));
    return (view.runGridHook ? view.runGridHook(run, signal || view.dataLifetime?.signal) : run(signal || view.lifetime.signal)).then(doc => recordPayload(view, id, doc, revision));
  }
  // The record's cached payload entry ({ state, payload, error, promise }), started on first use; null when nothing loads. A
  // failed entry stays until the reader retries (which drops it), so a failure never turns into a loop of requests.
  function recordEnsure(view, id) {
    const cache = view._recordPayloads ||= new Map(), key = recordCacheKey(view, id);
    let entry = cache.get(key);
    if (entry) return entry;
    if (!recordLoader(view)) return null;
    entry = { state: "loading" }; cache.set(key, entry);
    if (cache.size > 64) cache.delete(cache.keys().next().value);
    entry.promise = recordFetch(view, id, {}).then(payload => { entry.state = "ready"; entry.payload = payload; return payload; },
      error => { entry.state = "error"; entry.error = error; if (error.name !== "AbortError") view.emit("error", { error }); throw error; });
    entry.promise.catch(() => {});
    return entry;
  }
