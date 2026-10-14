  // ---------- optional parts: tree tools, and the grid editor and export parts ----------
  // Optional parts install on first use, from an inert payload in the page (a script of type
  // application/x-canopyx-<name>, and <name>-style for its stylesheet) or from files beside the runtime: the content-hashed
  // names when the runtime itself is content-hashed, the plain names otherwise. A part checks that it comes from the same
  // build as the runtime before it installs; a failed load can be retried.
  const PART_URL = typeof document !== "undefined" && document.currentScript?.src;
  function loadPart(part) {
    return part.ready ||= Promise.resolve().then(async () => {
      if (global[part.key]?.version !== part.version) {
        const find = type => document.querySelector('script[type="application/x-canopyx-' + type + '"][data-cx-version="' + part.version + '"]');
        const payload = find(part.name), script = h("script"), embeddedStyle = part.style && find(part.name + "-style");
        if (payload) {
          if (embeddedStyle) { const style = h("style"); setText(style, embeddedStyle.textContent); if (payload.nonce) style.nonce = payload.nonce; document.head.appendChild(style); }
          setText(script, payload.textContent); if (payload.nonce) script.nonce = payload.nonce; document.head.appendChild(script); script.remove();
        } else {
          const runtime = PART_URL || global.CanopyXFilterEditorBase || document.baseURI, hashed = PART_URL && /\.[a-f\d]{16}\.js(?:[?#]|$)/.test(PART_URL);
          const load = (element, attribute, file, kind) => new Promise((resolve, reject) => { element[attribute] = new URL(file, runtime).href; element.onload = resolve;
            element.onerror = () => { element.remove(); reject(new Error("CanopyX: " + part.label + " " + kind + " unavailable.")); }; document.head.appendChild(element); });
          const link = h("link"); link.rel = "stylesheet";
          await Promise.all([part.style && load(link, "href", hashed ? part.style : "canopyx-" + part.name + ".css", "stylesheet"),
            load(script, "src", hashed ? part.script : "canopyx-" + part.name + ".js", "script")]); script.remove();
        }
      }
      if (global[part.key]?.version !== part.version) throw new Error("CanopyX: " + part.label + " and runtime must come from the same build.");
      global[part.key].install(part.context());
    }).catch(error => { part.ready = null; throw error; });
  }

  // The tree toolbar menus (Columns, Views, Export, more), column fitting and auto height. Trees on every runtime load it.
  const TREE_TOOLS = { key: "CanopyXTreeTools", name: "tree-tools", label: "tree tools", version: "__CX_TOOLS_VERSION__", script: "__CX_TOOLS_SCRIPT__", style: "__CX_TOOLS_STYLE__",
    context: () => ({ TreeGrid, h, setText, fill, numberFormat, watchFlyout, columnWidth, prepareWidth, cellText, cellValue, isCellObject, foldText, formatting,
      sortKey, compareKeys, EXPORT_FORMATS, exportFormat, exportTimeout, INDENT, MAX_PROTOCOL_INTEGER, detailCell, HostCellContext, disposeHostSlot }) };
