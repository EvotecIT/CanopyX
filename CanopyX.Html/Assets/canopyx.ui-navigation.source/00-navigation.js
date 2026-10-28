// Shared lifetime, record discovery and cancellable selection for UI navigation.
UI_TOOLS.navigation = (() => {
  const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function owned(root, selector) {
    return Array.from(root.querySelectorAll(selector)).filter(el => el.closest('[data-cx-tabs],[data-cx-stepper]') === root);
  }
  function scope(signal) {
    const life = new AbortController();
    if (signal?.aborted) life.abort();
    else signal?.addEventListener('abort', () => life.abort(), { once: true, signal: life.signal });
    return life;
  }
  function records(root, kind, options) {
    const tabs = kind === 'tabs';
    const buttons = owned(root, tabs ? '[role="tab"]' : '[data-step-id]');
    const panels = owned(root, tabs ? '[role="tabpanel"]' : '.cx-step-panel');
    return buttons.map((element, index) => {
      const id = tabs ? element.dataset.tabId : element.dataset.stepId;
      const config = (options[tabs ? 'tabs' : 'steps'] || []).find(item => item.id === id) || {};
      const panel = tabs ? panels.find(el => el.id === element.getAttribute('aria-controls')) : panels[index];
      const iconSlot = element.querySelector('[data-icon]');
      if (iconSlot && options.renderIcon) {
        const rendered = options.renderIcon(iconSlot.dataset.icon, { ...config, id, index, element, panel });
        if (rendered?.nodeType) iconSlot.replaceChildren(rendered);
        else setText(iconSlot, typeof rendered === 'string' ? rendered : '');
      }
      return { ...config, id, index, element, panel,
        label: element.querySelector(tabs ? '.cx-tab-label' : '.cx-step-label')?.textContent || config.label || id,
        badge: element.querySelector('.cx-tab-badge')?.textContent || config.badge,
        icon: iconSlot ? iconSlot.firstElementChild || iconSlot.textContent || undefined : config.icon,
        disabled: element.getAttribute('aria-disabled') === 'true' || element.dataset.state === 'disabled',
        optional: element.dataset.optional === 'true',
        visited: element.dataset.visited === 'true',
        state: element.dataset.state || 'upcoming' };
    });
  }
  // A newer request invalidates both a pending guard and a pending loader, even
  // when host callbacks ignore AbortSignal. Only the newest request can commit.
  function selection(root, prefix, options, life, read, commit) {
    let version = 0, pending;
    function cancel() {
      version++;
      pending?.abort();
      pending?.element?.removeAttribute('aria-busy');
    }
    async function request(target, prepare, context) {
      cancel();
      if (!target || target.disabled || life.signal.aborted) return false;
      const controller = new AbortController(), ticket = version;
      controller.element = target.element;
      pending = controller;
      const live = () => ticket === version && !controller.signal.aborted && !life.signal.aborted;
      const from = read();
      const restoreFocus = () => {
        // Automatic progression leaves the user's focus where it is.
        if (context === 'auto') return;
        const target = prefix === 'tabs' ? from?.element : from?.element.querySelector('button') || from?.panel?.querySelector('[data-hfx-part="title"],h3');
        target?.focus();
      };
      target.element.setAttribute('aria-busy', 'true');
      const abort = () => controller.abort();
      life.signal.addEventListener('abort', abort, { once: true });
      try {
        if (prepare && await wait(prepare(from, target, controller.signal, live), controller.signal) === false) return false;
        if (!live()) return false;
        const guard = from !== target || context === 'finish';
        if (guard && !UI_TOOLS.emit(root, prefix, 'beforechange', { from, to: target, signal: controller.signal }, true)) {
          if (live()) restoreFocus();
          return false;
        }
        if (guard && await wait(options.beforeChange?.(from, target, controller.signal), controller.signal) === false) {
          if (live()) restoreFocus();
          return false;
        }
        if (!live()) return false;
        await wait(commit(from, target, controller.signal, live, context), controller.signal);
        return live();
      } catch (error) {
        if (live() && error?.name !== 'AbortError') UI_TOOLS.emit(root, prefix, 'error', { from, to: target, error });
        return false;
      } finally {
        life.signal.removeEventListener('abort', abort);
        // A stale completion must not erase a newer request's busy state.
        if (ticket === version) target.element.removeAttribute('aria-busy');
      }
    }
    life.signal.addEventListener('abort', cancel, { once: true });
    return { request, cancel };
  }
  function wait(value, signal) {
    return new Promise((resolve, reject) => {
      const task = Promise.resolve(value);
      const abort = () => reject(new DOMException('Navigation cancelled', 'AbortError'));
      if (signal.aborted) { task.catch(() => {}); abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      task.then(result => { signal.removeEventListener('abort', abort); resolve(result); }, error => {
        signal.removeEventListener('abort', abort); reject(error);
      });
    });
  }
  function resolve(items, value) { return typeof value === 'number' ? items[value] : items.find(item => item.id === value); }
  function position(labels, key, index, total) { return fill(labels[key], { current: index + 1, total }); }
  function panelTabStop(panel) {
    if (panel?.getAttribute('role') === 'tabpanel') {
      const hasFocusable = Array.from(panel.querySelectorAll(focusable)).some(el => el.checkVisibility() && !el.closest('[inert]'));
      panel.tabIndex = hasFocusable ? -1 : 0;
    }
  }
  function pickerItems(items, selected, disabled = item => item.disabled) {
    return items.map(item => ({ id: item.id, label: item.label, icon: item.icon, badge: item.badge,
      disabled: disabled(item), checked: item.id === selected }));
  }
  function button(label, className) {
    const el = document.createElement('button');
    el.type = 'button'; el.className = className; setText(el, label);
    return el;
  }
  return { owned, scope, records, selection, resolve, position, panelTabStop, pickerItems, button, focusable };
})();
