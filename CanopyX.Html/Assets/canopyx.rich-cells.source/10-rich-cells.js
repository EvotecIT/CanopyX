  // ---------- rich cells part: a sanitised subset of HTML in place of a cell's text (docs/data-protocol.md, "Rich cells") ----------
  // A cell object's `html` is parsed into an inert document (scripts never run there and nothing loads), and only allowed
  // elements, attributes and styles are built again as new elements in the page; the markup itself is never inserted.
  // Unknown elements keep their text; elements whose text is code or chrome (script, style, svg, …) go with their text.
  // Links keep http(s), mailto, relative and file addresses only and open a new window safely; styles are copied through
  // the CSSOM, which a strict Content Security Policy allows, and never take url(), var() or expressions. The parser never
  // sees a style attribute (a policy would report each one): inside tags it is renamed first and its declarations read here.
  const RICH_TAGS = new Set(["a", "abbr", "b", "br", "code", "del", "div", "em", "i", "img", "ins", "kbd", "li", "mark", "ol", "p", "s", "small", "span",
    "strong", "sub", "sup", "time", "u", "ul", "wbr"]);
  const RICH_DROPPED = new Set(["script", "style", "template", "noscript", "iframe", "object", "embed", "svg", "math", "textarea", "select", "title", "head", "button", "form"]);
  const RICH_ATTRIBUTES = { a: ["href", "target"], img: ["src", "alt", "width", "height"], time: ["datetime"], ol: ["start"] };
  const RICH_STYLES = ["color", "background-color", "font-weight", "font-style", "text-decoration", "white-space", "max-width", "overflow", "text-overflow", "display", "vertical-align"];
  const RICH_IMAGE = /^data:image\/(?:png|gif|jpeg|webp);base64,[a-z\d+/=\s]+$/i, RICH_CLASS = /^[A-Za-z_][\w-]{0,63}$/;
  const RICH_CACHE = new Map();
  /** A fresh copy of the sanitised content of markup; the last 500 results are kept. */
  function gridRichContent(html) {
    let template = RICH_CACHE.get(html);
    if (!template) {
      template = document.createDocumentFragment();
      const prepared = html.replace(/<[A-Za-z](?:[^>"']|"[^"]*"|'[^']*')*>/g, tag =>
        tag.replace(/("[^"]*"|'[^']*')|([\s/])style(\s*=)/gi, (match, quoted, before, equals) => quoted ?? before + "data-cx-style" + equals));
      const parsed = new DOMParser().parseFromString(trusted("HTML", prepared), "text/html");
      gridRichCopy(parsed.body, template, 0, { nodes: 0 });
      if (RICH_CACHE.size >= 500) RICH_CACHE.delete(RICH_CACHE.keys().next().value);
      RICH_CACHE.set(html, template);
    }
    return template.cloneNode(true);
  }
  function gridRichCopy(from, to, depth, budget) {
    for (const node of from.childNodes) {
      if (++budget.nodes > 2000) return;
      if (node.nodeType === 3) { to.appendChild(document.createTextNode(node.data)); continue; }
      if (node.nodeType !== 1) continue;
      const tag = node.localName;
      if (node.namespaceURI !== "http://www.w3.org/1999/xhtml" || RICH_DROPPED.has(tag)) continue;
      if (!RICH_TAGS.has(tag) || depth >= 16) { gridRichCopy(node, to, depth, budget); continue; }
      const element = document.createElement(tag);
      const classes = (node.getAttribute("class") || "").split(/\s+/).filter(token => RICH_CLASS.test(token)).slice(0, 16);
      if (classes.length) element.className = classes.join(" ");
      for (const name of ["title", "lang", "dir", ...(RICH_ATTRIBUTES[tag] || [])]) {
        const value = node.getAttribute(name);
        if (value === null || value.length > 8192) continue;
        if (name === "href") { const href = gridPresenterLink(value); if (href) element.setAttribute("href", href); }
        else if (name === "src") { const src = RICH_IMAGE.test(value) ? value : gridPresenterLink(value); if (src && !/^mailto:/i.test(src)) element.setAttribute("src", src); }
        else if (name === "target") { if (value === "_blank") { element.setAttribute("target", "_blank"); element.setAttribute("rel", "noopener noreferrer"); } }
        else if (name === "dir") { if (["ltr", "rtl", "auto"].includes(value)) element.setAttribute("dir", value); }
        else if (["width", "height", "start"].includes(name)) { if (/^\d{1,4}$/.test(value)) element.setAttribute(name, value); }
        else element.setAttribute(name, value);
      }
      for (const declaration of (node.getAttribute("data-cx-style") || "").slice(0, 2048).split(";")) {
        const colon = declaration.indexOf(":"), property = declaration.slice(0, colon).trim().toLowerCase(), value = declaration.slice(colon + 1).replace(/!\s*important\s*$/i, "").trim();
        if (colon > 0 && RICH_STYLES.includes(property) && value && value.length <= 128 && !/url\(|var\(|expression|[\\<>]/i.test(value)) element.style.setProperty(property, value);
      }
      gridRichCopy(node, element, depth + 1, budget);
      to.appendChild(element);
    }
  }
