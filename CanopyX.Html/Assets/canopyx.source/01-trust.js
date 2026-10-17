  // ---------- content security: the page nonce, Trusted Types and host HTML (docs/security.md) ----------
  // Under a strict Content Security Policy the elements the runtime inserts (a part's script and stylesheet, a bundle's
  // sidecar scripts) need the page's nonce: the one CanopyX.setNonce gave, else the nonce of the script element that
  // loaded the runtime, else that of any nonced script on the page. An embedded part's payload carries the nonce itself.
  // Under require-trusted-types-for 'script' the runtime hands its sinks values from one policy named "canopyx", created
  // on first use: script text and script URLs the runtime itself built (a payload already in the page, a file name beside
  // the runtime or the bundle), and HTML the host declared trusted (an html detail, a view's icons). Nothing else of the
  // runtime writes markup: host strings go through textContent.
  let pageNonce = typeof document !== "undefined" && document.currentScript?.nonce || "", trustPolicy;
  /** CanopyX.setNonce: the nonce for the scripts and stylesheets the runtime inserts from now on. */
  function setNonce(nonce) {
    if (typeof nonce !== "string" || !nonce) throw new Error("CanopyX: invalid nonce.");
    pageNonce = nonce;
  }
  /** Gives an element the runtime inserts the page's nonce. */
  function withNonce(element) {
    const nonce = pageNonce || document.querySelector("script[nonce]")?.nonce;
    if (nonce) element.nonce = nonce;
    return element;
  }
  /** A value for a Trusted Types sink: kind is "Script", "ScriptURL" or "HTML". Without enforcement, the value itself. */
  function trusted(kind, value) {
    if (trustPolicy === undefined) {
      // A page whose trusted-types directive does not list "canopyx" refuses the policy; its sinks then decide.
      try { trustPolicy = global.trustedTypes?.createPolicy("canopyx", { createHTML: text => text, createScript: text => text, createScriptURL: text => text }) || null; }
      catch (_) { trustPolicy = null; }
    }
    return trustPolicy ? trustPolicy["create" + kind](value) : value;
  }
  /**
   * Writes HTML the host declared trusted into an element. A sanitizeHtml host option, (html, { kind }) => string,
   * TrustedHTML or a Node, sees it first; kind is "detail" or "icon".
   */
  function hostHtml(element, html, sanitize, kind) {
    const text = String(html ?? ""), value = sanitize ? sanitize(text, { kind }) : text;
    if (value?.nodeType) element.replaceChildren(value);
    else if (typeof value === "string") element.innerHTML = trusted("HTML", value);
    else if (global.trustedTypes?.isHTML?.(value)) element.innerHTML = value;
    else throw new Error("CanopyX: invalid sanitizeHtml result.");
  }
