let uiPickerIdentity = 0;
UI_TOOLS.picker = (root, options = {}) => {
  const element = h('div', 'cx-picker'); element.dataset.hfxPart = 'picker';
  const trigger = h('button', 'cx-picker-trigger cx-ui-button'); trigger.type = 'button';
  const lead = h('span', 'cx-picker-lead'), separator = h('span', 'cx-picker-separator');
  separator.setAttribute('aria-hidden', 'true'); setText(separator, '·');
  const icon = h('span', 'cx-picker-icon'); icon.setAttribute('aria-hidden', 'true');
  const label = h('span', 'cx-picker-label'), badge = h('span', 'cx-picker-badge'); badge.dataset.hfxPart = 'badge';
  const chevron = h('span', 'cx-picker-chevron'); chevron.setAttribute('aria-hidden', 'true'); setText(chevron, '▾');
  trigger.append(lead, separator, icon, label, badge, chevron);
  const menu = h('div', 'cx-menu'); menu.hidden = true; menu.setAttribute('role', 'menu');
  menu.id = 'cx-ui-picker-menu-' + ++uiPickerIdentity;
  trigger.id = menu.id + '-trigger';
  element.append(trigger, menu); root.append(element);
  let state = { ...options }, destroyed = false, selectionVersion = 0;
  const renderIcon = value => value?.nodeType ? value.cloneNode(true) : value;
  const controller = UI_IMPL.menu(menu, { trigger, host: root, renderIcon,
    async onSelect(item) {
      const ticket = ++selectionVersion;
      // Menus check radio items eagerly. A picker reflects only host commits,
      // including while a navigation guard is pending or rejects the choice.
      syncChecks();
      try { await state.onSelect?.(item.id); }
      catch {
        // The host owns navigation errors; restore the committed choice.
      }
      finally { if (!destroyed && ticket === selectionVersion) syncChecks(); }
    } });
  function syncChecks() {
    for (const item of menu.querySelectorAll('[role="menuitemradio"]')) {
      const checked = item.dataset.itemId === state.selected;
      item.setAttribute('aria-checked', String(checked));
      item.dataset.state = item.getAttribute('aria-disabled') === 'true' ? 'disabled' : checked ? 'selected' : '';
    }
  }
  function update(next = {}) {
    if (destroyed) return;
    selectionVersion++;
    state = { ...state, ...next };
    const items = state.items || [], selected = items.find(item => item.id === state.selected);
    setText(lead, state.lead); lead.hidden = !state.lead;
    setText(label, selected?.label); label.hidden = !selected;
    separator.hidden = !state.lead || !selected;
    setText(badge, selected?.badge); badge.hidden = selected?.badge == null || selected.badge === '';
    icon.replaceChildren(); icon.hidden = selected?.icon == null;
    if (selected?.icon?.nodeType) icon.append(selected.icon.cloneNode(true));
    else if (selected?.icon != null) setText(icon, selected.icon);
    trigger.setAttribute('aria-label', [state.lead, selected?.label, selected?.badge].filter(value => value != null && value !== '').join(' '));
    trigger.disabled = !items.length;
    element.dataset.state = !items.length ? 'disabled' : selected ? 'selected' : '';
    // Dispose child overlays before replacing their DOM. Picker choices are leaves.
    controller.close('update', false, true);
    UI_TOOLS.menuItems(menu, items.map(item => ({ ...item, kind: 'radio', checked: item.id === state.selected })), { renderIcon });
    controller.refresh();
  }
  function destroy() {
    if (destroyed) return; destroyed = true; selectionVersion++; controller.destroy(); element.remove();
  }
  update();
  return { element, update, destroy };
};
