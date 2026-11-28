  // ---------- parts: runtime code loaded when a view needs it (Build/parts.json, docs/plugins.md) ----------
  // PARTS is this build's manifest: each part this entry point may load, as name -> [version, content-hashed script,
  // content-hashed stylesheet]. A part's script registers its code with registerPart (directly, or through the
  // CanopyXParts queue when it runs before the runtime) and installs on first use. A part the page carries (its own
  // <script> and an inert <style media="not all"> template, written by CanopyX.Html) has registered by then; any other part
  // loads from the files beside the runtime: the content-hashed names when the runtime itself is content-hashed, the plain
  // names otherwise. A part installs only when its version is this build's; a failed load can be retried. Its requires
  // install before it. The runtime never turns page text into script or style (docs/security.md).
  const PART_URL = typeof document !== "undefined" && document.currentScript?.src;
  // Where each accepted registration came from, which decides its stylesheet (docs/plugins.md#part-stylesheets): "entry" (the
  // entry point registered it while its own script still ran; a microtask ends that), "page" (a part script the page carries),
  // "file" (the loader's script for the part file) or "host" (a host preload).
  const PART_SOURCE = new Map(), LOADER_SCRIPTS = new WeakSet();
  let drainingParts = false, entryRunning = true;
  Promise.resolve().then(() => { entryRunning = false; });
  const PARTS = __CX_PARTS__, PART_CODE = new Map(), SHARED_PARTS = {}, partName = name => typeof name === "string" && /^[a-z][a-z\d-]{0,31}$/.test(name);
  const manifest = name => Object.hasOwn(PARTS, name) ? PARTS[name] : [];
  /**
   * Registers a part's code ({ version, requires?, install(context) }) under its name; parts of this build call it as they run.
   * A part file queued before the runtime passes the script element it ran from, so its origin is known when it registers.
   */
  function registerPart(name, part, from) {
    if (!partName(name) || !part || typeof part.version !== "string" || typeof part.install !== "function" ||
        part.requires !== undefined && !(Array.isArray(part.requires) && part.requires.every(partName))) throw new Error("CanopyX: invalid part.");
    // Fragments written without a shared document each carry the parts they need, so a part can register more than once,
    // and a page may hold a copy from another build. A registration of this build's version stays; another copy only
    // replaces a registration that is not this build's.
    const current = PART_CODE.get(name), wanted = manifest(name)[0] || part.version;
    if (!current || current.version !== part.version && current.version !== wanted) {
      PART_CODE.set(name, part);
      const script = from !== undefined ? from : typeof document !== "undefined" ? document.currentScript : null;
      PART_SOURCE.set(name, LOADER_SCRIPTS.has(script) ? "file" : script?.dataset?.canopyxPart === name ? "page" : entryRunning && !drainingParts ? "entry" : "host");
    }
  }
  // Part stylesheets (docs/plugins.md#part-stylesheets). The page's <style data-canopyx-part media="not all"
  // data-canopyx-template> elements are templates that never apply, so copies the page gains or loses (innerHTML, re-inserted nodes, other builds) change
  // nothing. Each part has one stylesheet: a host's own marked stylesheet of this version, or the runtime's, which it marks
  // data-canopyx-owned: a clone in document.head of a template the policy allowed (a refused one has no sheet), with its nonce
  // and without the media, or, with fallback, the part's file, linked. Every load checks it again: one that left the document
  // is replaced, a link removed while it loads is abandoned, a
  // failed file load is shared and then retried, and the runtime's other copies of the part are removed; a host's never are.
  // A clone a host's stylesheet took over waits in SPARE_SHEETS, so it applies again if the host's stops and no template is left.
  const PART_SHEETS = new Map(), SPARE_SHEETS = new Map();
  // A host stylesheet counts while it is enabled and its media (its CSSOM list, which can change without the attribute) matches.
  const live = element => element.sheet && !element.sheet.disabled && (!element.sheet.media.mediaText || matchMedia(element.sheet.media.mediaText).matches);
  // The runtime's own copy applies while it is in the document; disabling it or changing its media is outside the contract.
  const applies = owned => owned.element.getRootNode() === document && (owned.abandon || (owned.host ? live(owned.element) : owned.element.sheet));
  function partSheet(part, fallback) {
    const [version, , styleFile] = manifest(part.name);
    if (!styleFile || typeof document === "undefined") return;
    const elements = [...document.querySelectorAll("style[data-canopyx-part],link[data-canopyx-part]")].filter(element => element.dataset.canopyxPart === part.name);
    const mine = element => element.dataset.cxVersion === version && !("canopyxOwned" in element.dataset);
    const again = () => Object.assign(new Error("CanopyX: " + part.label + " stylesheet replaced."), { abandoned: true });
    // A template's media="not all" never matches, so it is never a host's stylesheet.
    const host = elements.find(element => mine(element) && live(element));
    let owned = PART_SHEETS.get(part.name);
    // A host's marked stylesheet takes over from the runtime's copy, also while the runtime's link still loads.
    if (owned && (!applies(owned) || host && owned.element !== host)) {
      owned.abandon?.(again());
      if (host && !owned.host && owned.element.localName === "style") SPARE_SHEETS.set(part.name, owned.element);
      if (!owned.host) owned.element.remove();
      PART_SHEETS.delete(part.name); owned = undefined;
    }
    if (!owned) {
      const allowed = elements.filter(element => mine(element) && "canopyxTemplate" in element.dataset && element.sheet);
      const template = pageNonce && allowed.find(style => style.nonce === pageNonce) || allowed[0];
      const spare = SPARE_SHEETS.get(part.name);
      if (host) owned = { element: host, host: true };
      else if (!template && spare) { document.head.appendChild(spare); if (spare.sheet) owned = { element: spare }; else spare.remove(); }
      else if (template) {
        const copy = template.cloneNode(true);
        copy.removeAttribute("media"); copy.nonce = template.nonce; copy.dataset.canopyxOwned = ""; document.head.appendChild(copy);
        if (copy.sheet) owned = { element: copy }; else copy.remove();
      }
      if (!owned) {
        if (!fallback) return;
        const link = h("link"); link.rel = "stylesheet";
        Object.assign(link.dataset, { canopyxPart: part.name, cxVersion: version, canopyxOwned: "" });
        owned = { element: link };
        // When the link settles, a host stylesheet that applies meanwhile sends the waiters to partSheet again (abandoned),
        // which takes the host's.
        const hostApplies = () => [...document.querySelectorAll("style[data-canopyx-part],link[data-canopyx-part]")].some(element => element.dataset.canopyxPart === part.name && mine(element) && live(element));
        owned.ready = new Promise((resolve, reject) => { owned.abandon = reject; partFile(part, link, "href", styleFile, "stylesheet").then(resolve, reject); })
          .then(() => { owned.abandon = null; if (hostApplies()) throw again(); }, error => {
            if (PART_SHEETS.get(part.name) === owned) PART_SHEETS.delete(part.name);
            link.remove();
            throw hostApplies() ? again() : error;
          });
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
    // Checked first, so a stylesheet that left the head is replaced even while the part is still installing. Code from its
    // file needs its stylesheet, on every load. A part the page carries falls back to the file too, without waiting for it;
    // an entry point's part and a host preload take a host's stylesheet or a template, and install without one.
    const source = PART_CODE.get(part.name)?.version === manifest(part.name)[0] ? PART_SOURCE.get(part.name) : "file";
    const required = source === "file", sheet = partSheetReady(part, required || source === "page");
    if (!required) sheet.catch(() => {});
    const installed = part.ready ||= Promise.resolve().then(async () => {
      const [version, scriptFile] = manifest(part.name);
      part.version = version;
      if (!version) throw new Error("CanopyX: no " + part.label + ".");
      const script = h("script");
      LOADER_SCRIPTS.add(script);
      const code = PART_CODE.get(part.name)?.version === version || (part.scriptReady ||= partFile(part, script, "src", scriptFile, "script")
        .finally(() => script.remove()).catch(error => { part.scriptReady = null; throw error; }));
      await Promise.all([required && sheet, code]);
      const registered = PART_CODE.get(part.name);
      if (registered?.version !== version) throw new Error("CanopyX: " + part.label + " and runtime must come from the same build.");
      for (const name of registered.requires || []) await loadPart(part.parts[name] || SHARED_PARTS[name]);
      registered.install(part.context());
    }).catch(error => { part.ready = null; throw error; });
    // Installed once; its stylesheet, and those of the parts it requires, are checked on every load.
    return Promise.all([installed, required && sheet]).then(() => Promise.all((PART_CODE.get(part.name).requires || []).map(name => loadPart(part.parts[name] || SHARED_PARTS[name])))).then(() => undefined);
  }
  // Parts that ran before the runtime left their registrations in a plain array; later ones register at once.
  const partQueue = global.CanopyXParts = global.CanopyXParts || [];
  drainingParts = true;
  partQueue.forEach(entry => registerPart(...entry));
  drainingParts = false;
  partQueue.length = 0;
  partQueue.push = (...entries) => { entries.forEach(entry => registerPart(...entry)); return 0; };
