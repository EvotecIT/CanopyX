let uiMenuIdentity = 0;
const uiMenuItemSelector = '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]';
const uiMenuModels = new WeakMap();

// Generated menus and the .NET renderer share the same DOM contract.
UI_TOOLS.menuItems = (menu, items, options = {}) => {
  menu.replaceChildren();
  const render = (container, entries) => {
    for (const item of entries || []) {
      const kind = String(item.kind || item.type || '').toLowerCase();
      if (kind === 'separator' || kind === 'grouplabel') {
        const decoration = h('div', kind === 'separator' ? 'cx-menu-separator' : 'cx-menu-group-label');
        decoration.setAttribute('role', kind === 'separator' ? 'separator' : 'presentation');
        if (kind !== 'separator') setText(decoration, item.label);
        container.append(decoration); continue;
      }
      const button = h('button', 'cx-menu-item'); button.type = 'button'; button.tabIndex = -1;
      button.id = 'cx-ui-menu-item-' + ++uiMenuIdentity;
      button.dataset.itemId = String(item.id); button.dataset.hfxPart = 'menu-item';
      const role = kind === 'radio' || item.role === 'menuitemradio' ? 'menuitemradio' :
        kind === 'checkbox' || item.checked != null ? 'menuitemcheckbox' : 'menuitem';
      button.setAttribute('role', role);
      if (role !== 'menuitem') button.setAttribute('aria-checked', String(!!item.checked));
      if (item.disabled) button.setAttribute('aria-disabled', 'true');
      button.dataset.state = item.disabled ? 'disabled' : item.checked ? 'selected' : '';
      button.dataset.danger = String(!!item.danger);
      if (item.group != null) button.dataset.radioGroup = String(item.group);
      const icon = h('span', 'cx-menu-icon'); icon.setAttribute('aria-hidden', 'true');
      if (item.icon != null) {
        icon.dataset.icon = String(item.icon);
        const rendered = options.renderIcon?.(item.icon, item);
        if (rendered?.nodeType) icon.append(rendered.cloneNode(true));
        else if (rendered != null) setText(icon, rendered);
      }
      button.append(icon);
      const label = h('span', 'cx-menu-label'); setText(label, item.label); button.append(label);
      if (item.badge != null && item.badge !== '') {
        const badge = h('span', 'cx-menu-badge'); badge.dataset.hfxPart = 'badge';
        setText(badge, item.badge); button.append(badge);
      }
      if (item.shortcut) { const shortcut = h('kbd'); setText(shortcut, item.shortcut); button.append(shortcut); }
      uiMenuModels.set(button, item); container.append(button);
      if (item.items?.length) {
        button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
        const child = h('div', 'cx-menu'); child.id = button.id + '-menu'; child.hidden = true;
        child.setAttribute('role', 'menu'); child.setAttribute('aria-labelledby', button.id);
        child.dataset.hfxPart = 'menu'; child.dataset.state = 'closed';
        button.setAttribute('aria-controls', child.id);
        const chevron = h('span', 'cx-menu-chevron'); chevron.setAttribute('aria-hidden', 'true');
        setText(chevron, '›'); button.append(chevron); container.append(child); render(child, item.items);
      }
    }
  };
  render(menu, items);
};

// A portalled submenu can be on either side after viewport flipping.
function uiMenuTriangle(point, origin, box) {
  if (!point || !origin || !box) return false;
  const x = Math.abs(box.left - origin.x) < Math.abs(box.right - origin.x) ? box.left : box.right;
  const a = origin, b = { x, y: box.top }, c = { x, y: box.bottom };
  const cross = (p, q, r) => (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
  const d = [cross(point, a, b), cross(point, b, c), cross(point, c, a)];
  return !(d.some(value => value < 0) && d.some(value => value > 0));
}
