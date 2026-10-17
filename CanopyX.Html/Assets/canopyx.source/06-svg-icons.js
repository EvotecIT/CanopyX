  // Decorative icons are fixed shape definitions. Build SVG elements directly, including under enforced Trusted Types.
  function svgIcon(shapes) {
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.classList.add("cx-ico"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    for (const [, tag, attributes] of shapes.matchAll(/<(\w+)([^>]*)\/>/g)) {
      const shape = svg.appendChild(document.createElementNS(ns, tag));
      for (const [, attribute, value] of attributes.matchAll(/([\w-]+)="([^"]*)"/g)) shape.setAttribute(attribute, value);
    }
    return svg;
  }
