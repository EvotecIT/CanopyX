  // ---------- parts: runtime code loaded when a view needs it (Build/parts.json, docs/plugins.md) ----------
  // PARTS is this build's manifest: each part this entry point may load, as name -> [version, content-hashed script,
  // content-hashed stylesheet]. A part's script registers its code with registerPart (directly, or through the
  // CanopyXParts queue when it runs before the runtime) and installs on first use, from an inert payload in the page (a
  // script of type application/x-canopyx-<name>, and <name>-style for its stylesheet) or from files beside the runtime:
  // the content-hashed names when the runtime itself is content-hashed, the plain names otherwise. A part installs only
  // when its version is this build's; a failed load can be retried. A part's requires load, and install, before it.
  const PART_URL = typeof document !== "undefined" && document.currentScript?.src;
  const PARTS = __CX_PARTS__, PART_CODE = new Map(), partName = name => typeof name === "string" && /^[a-z][a-z\d-]{0,31}$/.test(name);
  /** Registers a part's code ({ version, requires?, install(context) }) under its name; parts of this build call it as they run. */
  function registerPart(name, part) {
    if (!partName(name) || !part || typeof part.version !== "string" || typeof part.install !== "function" ||
        part.requires !== undefined && !(Array.isArray(part.requires) && part.requires.every(partName))) throw new Error("CanopyX: invalid part.");
    PART_CODE.set(name, part);
  }
  // A view kind's parts by name, each with the context its code installs into: definePart(TreeGrid, "tree-tools", ...).
  function definePart(View, name, label, context) {
    const parts = Object.hasOwn(View.prototype, "parts") ? View.prototype.parts : View.prototype.parts = {};
    return parts[name] = { name, label, context, parts };
  }
  // Build/Sync-Assets.ps1 refuses requires that name no part of the same view kind or that form a cycle.
  function loadPart(part) {
    return part.ready ||= Promise.resolve().then(async () => {
      const [version, scriptFile, styleFile] = Object.hasOwn(PARTS, part.name) ? PARTS[part.name] : [];
      part.version = version;
      if (!version) throw new Error("CanopyX: this runtime has no " + part.label + ".");
      if (PART_CODE.get(part.name)?.version !== part.version || part.styleReady === null) {
        // An embedded part runs with its payload's own nonce. When the page nonce is known (CanopyX.setNonce, or the runtime
        // script's own nonce), only a payload that carries it counts, so markup injected into the page cannot run as a part,
        // also under 'strict-dynamic' and Trusted Types.
        const find = type => [...document.querySelectorAll('script[type="application/x-canopyx-'+type+'"][data-cx-version="'+part.version+'"]')].find(item => !pageNonce || item.nonce === pageNonce);
        const payload = find(part.name), script = h("script"), embeddedStyle = styleFile && find(part.name + "-style");
        if (payload) {
          if (embeddedStyle) { const style = h("style"); style.nonce = payload.nonce; setText(style, embeddedStyle.textContent); document.head.appendChild(style); }
          script.textContent = trusted("Script", payload.textContent); script.nonce = payload.nonce; document.head.appendChild(script); script.remove();
        } else {
          const base = global.CanopyXFilterEditorBase, runtime = PART_URL || typeof base === "string" && base || document.baseURI, hashed = PART_URL && /\.[a-f\d]{16}\.js(?:[?#]|$)/.test(PART_URL);
          const load = (element, attribute, file, kind) => new Promise((resolve, reject) => { const url = new URL(file, runtime).href; element[attribute] = attribute === "src" ? trusted("ScriptURL", url) : url; element.onload = resolve;
            element.onerror = () => { element.remove(); reject(new Error("CanopyX: " + part.label + " " + kind + " unavailable.")); }; document.head.appendChild(withNonce(element)); });
          const link = h("link"); link.rel = "stylesheet";
          const style = styleFile && (part.styleReady ||= load(link, "href", hashed ? styleFile : "canopyx-" + part.name + ".css", "stylesheet")
            .catch(error => { part.styleReady = null; throw error; }));
          const code = PART_CODE.get(part.name)?.version === part.version || (part.scriptReady ||= load(script, "src", hashed ? scriptFile : "canopyx-" + part.name + ".js", "script")
            .finally(() => script.remove()).catch(error => { part.scriptReady = null; throw error; }));
          await Promise.all([style, code]);
        }
      }
      const code = PART_CODE.get(part.name);
      if (code?.version !== part.version) throw new Error("CanopyX: " + part.label + " and runtime must come from the same build.");
      for (const name of code.requires || []) await loadPart(part.parts[name]);
      code.install(part.context());
    }).catch(error => { part.ready = null; throw error; });
  }
  // Parts that ran before the runtime left their registrations in a plain array; later ones register at once.
  const partQueue = global.CanopyXParts = global.CanopyXParts || [];
  partQueue.forEach(entry => registerPart(...entry));
  partQueue.length = 0;
  partQueue.push = (...entries) => { entries.forEach(entry => registerPart(...entry)); return 0; };

  // The tree toolbar menus (Columns, Views, Export, more), column fitting and auto height. Trees on every runtime load it.
  const TREE_TOOLS = definePart(TreeGrid, "tree-tools", "tree tools", () => ({ TreeGrid, h, setText, fill, numberFormat, watchFlyout, columnWidth, prepareWidth, cellText, cellValue, isCellObject, foldText, formatting,
    sortKey, compareKeys, EXPORT_FORMATS, exportFormat, exportTimeout, INDENT, MAX_PROTOCOL_INTEGER, hostControl, detailCell, HostCellContext, disposeHostSlot, loadPart, definePart, pluginItems,
    applyTone, toneOf, badgeElement, RECORD_IMPL, svgIcon, gridExportField }));
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
