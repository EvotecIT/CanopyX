  // ---------- parts: runtime code loaded when a view needs it (Build/parts.json, docs/plugins.md) ----------
  // PARTS is this build's manifest: each part this entry point may load, as name -> [version, content-hashed script,
  // content-hashed stylesheet]. A part's script registers its code with registerPart (directly, or through the
  // CanopyXParts queue when it runs before the runtime) and installs on first use. A part the page already carries (its
  // own <script> and <style> elements, written by CanopyX.Html) has registered by then; any other part loads from the files
  // beside the runtime: the content-hashed names when the runtime itself is content-hashed, the plain names otherwise. The
  // runtime never turns page text into script or style, so a strict policy (docs/security.md) needs no 'unsafe-inline'. A
  // part installs only when its version is this build's; a failed load can be retried. Its requires install before it.
  const PART_URL = typeof document !== "undefined" && document.currentScript?.src;
  const PARTS = __CX_PARTS__, PART_CODE = new Map(), SHARED_PARTS = {}, partName = name => typeof name === "string" && /^[a-z][a-z\d-]{0,31}$/.test(name);
  /** Registers a part's code ({ version, requires?, install(context) }) under its name; parts of this build call it as they run. */
  function registerPart(name, part) {
    if (!partName(name) || !part || typeof part.version !== "string" || typeof part.install !== "function" ||
        part.requires !== undefined && !(Array.isArray(part.requires) && part.requires.every(partName))) throw new Error("CanopyX: invalid part.");
    // Fragments written without a shared document each carry the parts they need, so a part can register more than once,
    // and a page may hold a copy from another build. A registration of this build's version stays; another copy only
    // replaces a registration that is not this build's.
    const current = PART_CODE.get(name), wanted = partVersion(name, part);
    if (!current || current.version !== part.version && current.version !== wanted) PART_CODE.set(name, part);
    settlePartSheets(name);
  }
  const partVersion = (name, part) => Object.hasOwn(PARTS, name) ? PARTS[name][0] : part.version;
  // A part's stylesheet the page carries sits beside its script inside a fragment. The page keeps one stylesheet per
  // part: the one the loader linked from a file, or else the page's copy of the accepted registration's version, when it
  // is this build's, moved into document.head (as linked stylesheets are) so removing its fragment keeps the rules. Copies
  // of other versions are removed; copies of this build's version wait while an older registration holds the name.
  const PART_SHEETS = new Map();
  function settlePartSheets(name) {
    const code = PART_CODE.get(name);
    if (!code || typeof document === "undefined") return;
    const wanted = partVersion(name, code), sheets = [...document.querySelectorAll("style[data-canopyx-part]")].filter(style => style.dataset.canopyxPart === name);
    if (code.version !== wanted) { sheets.forEach(style => style.dataset.cxVersion === wanted || style.remove()); return; }
    let kept = PART_SHEETS.get(name);
    if (kept && kept.dataset.cxVersion !== code.version) { kept.remove(); kept = undefined; PART_SHEETS.delete(name); }
    if (!kept) {
      // The registering script's own stylesheet first (the element before it), then one with the page nonce, which a
      // policy applied: never an injected look-alike placed earlier.
      const matching = sheets.filter(style => style.dataset.cxVersion === code.version), own = document.currentScript?.previousElementSibling;
      kept = matching.includes(own) ? own : pageNonce && matching.find(style => style.nonce === pageNonce) || matching[0];
      if (kept) {
        PART_SHEETS.set(name, kept);
        if (kept.getRootNode() === document && kept.parentNode !== document.head) document.head.appendChild(kept);
      }
    }
    sheets.forEach(style => style === kept || style.remove());
  }
  // A view kind's parts by name, each with the context its code installs into: definePart(TreeGrid, "tree-tools", ...).
  function definePart(View, name, label, context) {
    // Interactive wrappers inherit the same view kind. A later lazy registration must keep that kind's existing parts.
    const parts = View.prototype.parts ||= {};
    return parts[name] = { name, label, context, parts };
  }
  // Build/Sync-Assets.ps1 refuses requires that name no part of the same view kind or that form a cycle.
  function loadPart(part) {
    // A fragment set through innerHTML brings its stylesheet but never runs its script: settle the page's copies again.
    settlePartSheets(part.name);
    return part.ready ||= Promise.resolve().then(async () => {
      const [version, scriptFile, styleFile] = Object.hasOwn(PARTS, part.name) ? PARTS[part.name] : [];
      part.version = version;
      if (!version) throw new Error("CanopyX: no " + part.label + ".");
      if (PART_CODE.get(part.name)?.version !== part.version || part.styleReady === null) {
        const base = global.CanopyXFilterEditorBase, runtime = PART_URL || typeof base === "string" && base || document.baseURI, hashed = PART_URL && /\.[a-f\d]{16}\.js(?:[?#]|$)/.test(PART_URL);
        const load = (element, attribute, file, kind) => new Promise((resolve, reject) => { const url = new URL(file, runtime).href; element[attribute] = attribute === "src" ? trusted("ScriptURL", url) : url; element.onload = resolve;
          element.onerror = () => { element.remove(); reject(new Error("CanopyX: " + part.label + " " + kind + " unavailable.")); }; document.head.appendChild(withNonce(element)); });
        const link = h("link"), script = h("script"); link.rel = "stylesheet";
        // The linked stylesheet is the part's one stylesheet; page copies that arrive later give way to it.
        Object.assign(link.dataset, { canopyxPart: part.name, cxVersion: version });
        const style = styleFile && (part.styleReady ||= load(link, "href", hashed ? styleFile : "canopyx-" + part.name + ".css", "stylesheet")
          .then(() => { PART_SHEETS.get(part.name)?.remove(); PART_SHEETS.set(part.name, link); settlePartSheets(part.name); })
          .catch(error => { part.styleReady = null; throw error; }));
        const code = PART_CODE.get(part.name)?.version === part.version || (part.scriptReady ||= load(script, "src", hashed ? scriptFile : "canopyx-" + part.name + ".js", "script")
          .finally(() => script.remove()).catch(error => { part.scriptReady = null; throw error; }));
        await Promise.all([style, code]);
      }
      const code = PART_CODE.get(part.name);
      if (code?.version !== part.version) throw new Error("CanopyX: " + part.label + " and runtime must come from the same build.");
      for (const name of code.requires || []) await loadPart(part.parts[name] || SHARED_PARTS[name]);
      code.install(part.context());
    }).catch(error => { part.ready = null; throw error; });
  }
  // Parts that ran before the runtime left their registrations in a plain array; later ones register at once.
  const partQueue = global.CanopyXParts = global.CanopyXParts || [];
  partQueue.forEach(entry => registerPart(...entry));
  partQueue.length = 0;
  partQueue.push = (...entries) => { entries.forEach(entry => registerPart(...entry)); return 0; };
