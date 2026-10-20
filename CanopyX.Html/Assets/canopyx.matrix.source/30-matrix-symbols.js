  // ---------- matrix: the state symbols, so a state never relies on colour alone ----------
  // Each symbol is a small stroked SVG in currentColor (the state's tone); cells and the legend clone one prepared copy.
  const MATRIX_SYMBOL_PATHS = {
    check: "M3.5 8.4l2.9 2.9 6.1-6.6", cross: "M4.5 4.5l7 7M11.5 4.5l-7 7", warning: "M8 2.6l5.8 10.4H2.2zM8 6.6v3M8 11.4v.2",
    info: "M8 1.9a6.1 6.1 0 1 0 0 12.2A6.1 6.1 0 0 0 8 1.9zM8 7.3v3.9M8 4.9v.2", dot: "", dash: "M4.2 8h7.6",
    question: "M5.9 6.1a2.1 2.1 0 1 1 2.8 2c-.5.2-.7.6-.7 1.1v.5M8 11.6v.2", clock: "M8 1.9a6.1 6.1 0 1 0 0 12.2A6.1 6.1 0 0 0 8 1.9zM8 4.8V8l2.2 1.4",
    pause: "M6 4.4v7.2M10 4.4v7.2"
  };
  const MATRIX_SYMBOL_CACHE = new Map();
  function matrixSymbol(name) {
    if (!name) return null;
    let template = MATRIX_SYMBOL_CACHE.get(name);
    if (!template) {
      const ns = "http://www.w3.org/2000/svg";
      template = document.createElementNS(ns, "svg");
      template.setAttribute("viewBox", "0 0 16 16"); template.setAttribute("aria-hidden", "true"); template.setAttribute("focusable", "false");
      template.setAttribute("class", "cx-mx-symbol");
      if (name === "dot") {
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", "8"); circle.setAttribute("cy", "8"); circle.setAttribute("r", "3.6"); circle.setAttribute("fill", "currentColor");
        template.appendChild(circle);
      } else {
        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", MATRIX_SYMBOL_PATHS[name]); path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "1.8"); path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
        template.appendChild(path);
      }
      MATRIX_SYMBOL_CACHE.set(name, template);
    }
    return template.cloneNode(true);
  }
