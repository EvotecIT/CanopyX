  // ---------- parts: runtime code loaded when a view needs it (Build/parts.json, docs/plugins.md) ----------
  // PARTS is this build's manifest: each part this entry point may load, as name -> [version, content-hashed script,
  // content-hashed stylesheet]. A part's script registers its code with registerPart (directly, or through the
  // CanopyXParts queue when it runs before the runtime) and installs on first use. A part the page carries (its own
  // <script> and an inert <style media="not all"> template, written by CanopyX.Html) has registered by then; any other part
  // loads from the files beside the runtime: the content-hashed names when the runtime itself is content-hashed, the plain
  // names otherwise. A part installs only when its version is this build's; a failed load can be retried. Its requires
  // install before it. The runtime never turns page text into script or style (docs/security.md).
  const PART_URL = typeof document !== "undefined" && document.currentScript?.src;
  // Parts the entry point registers itself, while its own script still runs (a microtask ends that): their stylesheets reach
  // the page with the entry point's. Parts whose code came from their files need theirs.
  const ENTRY_PARTS = new Set(), FILE_PARTS = new Set();
  let drainingParts = false, entryRunning = true;
  Promise.resolve().then(() => { entryRunning = false; });
  const PARTS = __CX_PARTS__, PART_CODE = new Map(), SHARED_PARTS = {}, partName = name => typeof name === "string" && /^[a-z][a-z\d-]{0,31}$/.test(name);
  const manifest = name => Object.hasOwn(PARTS, name) ? PARTS[name] : [];
  /** Registers a part's code ({ version, requires?, install(context) }) under its name; parts of this build call it as they run. */
  function registerPart(name, part) {
    if (!partName(name) || !part || typeof part.version !== "string" || typeof part.install !== "function" ||
        part.requires !== undefined && !(Array.isArray(part.requires) && part.requires.every(partName))) throw new Error("CanopyX: invalid part.");
    // Fragments written without a shared document each carry the parts they need, so a part can register more than once,
    // and a page may hold a copy from another build. A registration of this build's version stays; another copy only
    // replaces a registration that is not this build's.
    const current = PART_CODE.get(name), wanted = manifest(name)[0] || part.version;
    if (!current || current.version !== part.version && current.version !== wanted) {
      PART_CODE.set(name, part);
      if (entryRunning && !drainingParts) ENTRY_PARTS.add(name);
    }
  }
  // Part stylesheets (docs/plugins.md#part-stylesheets). The page's <style data-canopyx-part media="not all"> elements are
  // templates that never apply, so copies the page gains or loses (innerHTML, re-inserted nodes, other builds) change
  // nothing. Each part has one stylesheet: a host's own marked stylesheet of this version, or the runtime's, which it marks
  // data-canopyx-owned: a clone in document.head of a template the policy allowed (a refused one has no sheet), with its nonce
  // and without the media, or, with fallback, the part's file, linked. Every load checks it again: one that stopped applying
  // (removed, moved out of the document, disabled, given a media) is replaced, a link removed while it loads is abandoned, a
  // failed file load is shared and then retried, and the runtime's other copies of the part are removed; a host's never are.
  const PART_SHEETS = new Map();
  const applies = owned => owned.element.getRootNode() === document && (owned.abandon || owned.element.sheet && !owned.element.sheet.disabled && owned.element.media !== "not all");
  function partSheet(part, fallback) {
    const [version, , styleFile] = manifest(part.name);
    if (!styleFile || typeof document === "undefined") return;
    const elements = [...document.querySelectorAll("style[data-canopyx-part],link[data-canopyx-part]")].filter(element => element.dataset.canopyxPart === part.name);
    let owned = PART_SHEETS.get(part.name);
    if (owned && (owned.version !== version || !applies(owned))) {
      owned.abandon?.(Object.assign(new Error("CanopyX: " + part.label + " stylesheet replaced."), { abandoned: true }));
      if (!owned.host) owned.element.remove();
      PART_SHEETS.delete(part.name); owned = undefined;
    }
    if (!owned) {
      const mine = element => element.dataset.cxVersion === version && !("canopyxOwned" in element.dataset);
      const host = elements.find(element => mine(element) && element.media !== "not all" && element.sheet && !element.sheet.disabled);
      const allowed = elements.filter(element => mine(element) && element.media === "not all" && element.sheet);
      const template = pageNonce && allowed.find(style => style.nonce === pageNonce) || allowed[0];
      if (host) owned = { element: host, version, host: true };
      else if (template) {
        const copy = template.cloneNode(true);
        copy.removeAttribute("media"); copy.nonce = template.nonce; copy.dataset.canopyxOwned = ""; document.head.appendChild(copy);
        if (copy.sheet) owned = { element: copy, version }; else copy.remove();
      }
      if (!owned) {
        if (!fallback) return;
        const link = h("link"); link.rel = "stylesheet";
        Object.assign(link.dataset, { canopyxPart: part.name, cxVersion: version, canopyxOwned: "" });
        owned = { element: link, version };
        owned.ready = new Promise((resolve, reject) => { owned.abandon = reject; partFile(part, link, "href", styleFile, "stylesheet").then(resolve, reject); })
          .then(() => { owned.abandon = null; }, error => { if (PART_SHEETS.get(part.name) === owned) PART_SHEETS.delete(part.name); link.remove(); throw error; });
      }
      PART_SHEETS.set(part.name, owned);
    }
    for (const element of elements) if ("canopyxOwned" in element.dataset && element !== owned.element) element.remove();
    return owned.ready;
  }
  /** The part's stylesheet (undefined once it applies), following a replacement when the link it waited for was removed. */
  async function partSheetReady(part, fallback) {
    for (;;) {
      try { return await partSheet(part, fallback); } catch (error) { if (!error.abandoned) throw error; }
    }
  }
  // A view kind's parts by name, each with the context its code installs into: definePart(TreeGrid, "tree-tools", ...).
  function definePart(View, name, label, context) {
    // Interactive wrappers inherit the same view kind. A later lazy registration must keep that kind's existing parts.
    const parts = View.prototype.parts ||= {};
    return parts[name] = { name, label, context, parts };
  }
  // Build/Sync-Assets.ps1 refuses requires that name no part of the same view kind or that form a cycle.
  /** Loads a part file beside the runtime into an element: the plain names, or the content-hashed ones beside a hashed runtime. */
  function partFile(part, element, attribute, hashedFile, kind) {
    const base = global.CanopyXFilterEditorBase, runtime = PART_URL || typeof base === "string" && base || document.baseURI, hashed = PART_URL && /\.[a-f\d]{16}\.js(?:[?#]|$)/.test(PART_URL);
    const file = hashed ? hashedFile : "canopyx-" + part.name + (attribute === "src" ? ".js" : ".css");
    return new Promise((resolve, reject) => { const url = new URL(file, runtime).href; element[attribute] = attribute === "src" ? trusted("ScriptURL", url) : url; element.onload = resolve;
      element.onerror = () => { element.remove(); reject(new Error("CanopyX: " + part.label + " " + kind + " unavailable.")); }; document.head.appendChild(withNonce(element)); });
  }
  function loadPart(part) {
    // Checked first, so a stylesheet that left the head is replaced even while the part is still installing. Code that was
    // registered before this load (a part the page carries, or a host preload whose host provides the stylesheet) installs
    // without waiting for a stylesheet file, and even when none can be applied; the next load tries again. Code loaded from its file needs its stylesheet. A
    // part the entry point registers itself uses a template when the page has one, and otherwise the entry point's styles.
    const preloaded = PART_CODE.get(part.name)?.version === manifest(part.name)[0];
    // The file is the fallback for code from its file and for a part the page carries (its script is in the page); a part the
    // entry point registered, or a host preloaded, takes the host's stylesheet or a template.
    const carried = typeof document !== "undefined" && [...document.querySelectorAll("script[data-canopyx-part]")].some(script => script.dataset.canopyxPart === part.name);
    const sheet = partSheetReady(part, !preloaded || FILE_PARTS.has(part.name) || carried && !ENTRY_PARTS.has(part.name));
    if (preloaded) sheet.catch(() => {});
    const installed = part.ready ||= Promise.resolve().then(async () => {
      const [version, scriptFile] = manifest(part.name);
      part.version = version;
      if (!version) throw new Error("CanopyX: no " + part.label + ".");
      const script = h("script");
      const code = PART_CODE.get(part.name)?.version === version || (part.scriptReady ||= partFile(part, script, "src", scriptFile, "script")
        .then(() => FILE_PARTS.add(part.name)).finally(() => script.remove()).catch(error => { part.scriptReady = null; throw error; }));
      await Promise.all([preloaded || sheet, code]);
      const registered = PART_CODE.get(part.name);
      if (registered?.version !== version) throw new Error("CanopyX: " + part.label + " and runtime must come from the same build.");
      for (const name of registered.requires || []) await loadPart(part.parts[name] || SHARED_PARTS[name]);
      registered.install(part.context());
    }).catch(error => { part.ready = null; throw error; });
    // Installed once; its stylesheet, and those of the parts it requires, are checked on every load.
    return Promise.all([installed, preloaded || sheet]).then(() => Promise.all((PART_CODE.get(part.name).requires || []).map(name => loadPart(part.parts[name] || SHARED_PARTS[name])))).then(() => undefined);
  }
  // Parts that ran before the runtime left their registrations in a plain array; later ones register at once.
  const partQueue = global.CanopyXParts = global.CanopyXParts || [];
  drainingParts = true;
  partQueue.forEach(entry => registerPart(...entry));
  drainingParts = false;
  partQueue.length = 0;
  partQueue.push = (...entries) => { entries.forEach(entry => registerPart(...entry)); return 0; };
