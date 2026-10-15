  // Paths from the approved Graphite reference; decorative icons never become accessible names.
  const GRID_ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>',
    columns: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15M14.5 4.5v15"/>',
    views: '<path d="M6 4h12v16l-6-4-6 4z"/>',
    export: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    chart: '<path d="M4 19h16M7 16V10M12 16V6M17 16v-4"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    retry: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>',
    previous: '<path d="m14 7-5 5 5 5"/>', next: '<path d="m10 7 5 5-5 5"/>',
    first: '<path d="m13 7-5 5 5 5M17 7l-5 5 5 5"/>', last: '<path d="m11 7 5 5-5 5M7 7l5 5-5 5"/>'
  };
  // The icon's shapes (GRID_ICONS, or the constant shapes a menu passes) are built as elements, not parsed as markup, so
  // icons need no HTML sink (docs/security.md).
  function gridIcon(name, shapes) {
    const svgNs = "http://www.w3.org/2000/svg", svg = document.createElementNS(svgNs, "svg");
    svg.classList.add("cx-ico"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    for (const [, tag, attributes] of (shapes || GRID_ICONS[name] || GRID_ICONS.more).matchAll(/<(\w+)([^>]*)\/>/g)) {
      const shape = svg.appendChild(document.createElementNS(svgNs, tag));
      for (const [, attribute, value] of attributes.matchAll(/([\w-]+)="([^"]*)"/g)) shape.setAttribute(attribute, value);
    }
    return svg;
  }
  function gridDecorateButton(button, icon, ghost) {
    button.classList.add("cx-btn"); if (ghost) button.classList.add("ghost");
    if (icon) button.prepend(gridIcon(icon)); return button;
  }
  function gridFilterCount(query) {
    const count = group => group ? group.filters.length + group.groups.reduce((sum, child) => sum + count(child), 0) : 0;
    return (query?.filters?.length || 0) + count(query?.filterGroup);
  }
