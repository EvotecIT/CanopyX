UI_TOOLS.stepperView = (root, options, labels, life, select, back, issueCount) => {
  const n = UI_TOOLS.navigation, header = n.owned(root, 'ol.cx-stepper')[0];
  const footer = n.owned(root, '.cx-stepper-footer')[0];
  const live = n.owned(root, '[aria-live="polite"]')[0];
  const originalButtons = new Map(n.owned(root, '[data-cx-stepper-action]').map(el => [el.dataset.cxStepperAction, el.textContent]));
  const footerData = footer?.dataset || {};
  const actionLabel = (action, key, fallback) => options[key] ?? footerData[key] ?? originalButtons.get(action) ?? fallback;
  const phone = h('div', 'cx-stepper-phone');
  const backButton = n.button(labels.stepperBack, 'cx-stepper-phone-back');
  backButton.dataset.cxStepperAction = 'back'; backButton.setAttribute('aria-label', labels.stepperBack); setText(backButton, '\u2039');
  const picker = UI_TOOLS.picker(root, { lead: '', items: [], selected: null, onSelect: select });
  const progress = h('div', 'cx-stepper-progress'), bar = h('span');
  progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-label', labels.stepperAllSteps);
  progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', '100'); progress.append(bar);
  phone.append(backButton, picker.element, progress); header?.before(phone);
  const home = new Map(), descriptions = new Map(), inserted = new Set(), printStates = new Map(), printMarkers = new Map();
  let items = [], current, states, visited, allowed, narrow = false;
  const placement = options.vertical ?? root.dataset.vertical;
  const vertical = options.vertical != null ? !!options.vertical
    : header?.classList.contains('cx-stepper--vertical') || root.dataset.layout === 'vertical' || placement === 'inline';
  header?.classList.toggle('cx-stepper--vertical', !!vertical);
  root.dataset.layout = vertical ? 'vertical' : 'horizontal';
  root.dataset.vertical = placement === 'inline' ? 'inline' : 'side';
  function status(item) {
    const state = states.get(item.id), count = issueCount(item);
    if (state === 'error') return count > 1 ? fill(labels.stepperIssues, { count }) : labels.stepperIssue;
    if (state === 'done') return labels.stepperCompleted;
    if (state === 'skipped') return labels.stepperSkipped;
    return item.optional ? labels.stepperOptional : '';
  }
  function step(item) {
    const el = item.element, state = item.state, enabled = item !== current && allowed(item);
    el.dataset.state = state; el.dataset.visited = String(item.visited);
    if (item === current) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
    if (item.disabled) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
    let button = el.querySelector(':scope > .cx-step-btn');
    if (enabled && !button) {
      button = n.button('', 'cx-step-btn');
      // Move the existing label/marker nodes; never move a vertical inline panel
      // into its header button, and never clone host interactive content.
      Array.from(el.childNodes).filter(child => child !== item.panel).forEach(child => button.append(child)); el.prepend(button);
    } else if (!enabled && button) { button.replaceWith(...button.childNodes); button = null; }
    if (button) {
      button.dataset.cxStep = String(item.index);
      if (item.panel) button.setAttribute('aria-controls', item.panel.id);
    }
    const marker = el.querySelector('.cx-step-marker');
    if (marker) setText(marker, state === 'done' ? '\u2713' : state === 'error' ? '!' : state === 'skipped' ? '\u2013' : item.index + 1);
    let description = el.querySelector('.cx-step-desc');
    if (!descriptions.has(el)) descriptions.set(el, description?.textContent || '');
    const text = status(item) || descriptions.get(el);
    if (!description && text) { description = h('span', 'cx-step-desc'); (button || el).append(description); inserted.add(description); }
    if (description) setText(description, text);
    let accessible = el.querySelector('.cx-visually-hidden');
    if (!accessible) { accessible = h('span', 'cx-visually-hidden'); (button || el).append(accessible); inserted.add(accessible); }
    setText(accessible, ', ' + n.position(labels, 'stepperStepOf', item.index, items.length) + (text ? ', ' + text : ''));
    if (item.panel) {
      if (!printStates.has(item.panel)) {
        const line = h('p', 'cx-step-print-state'); line.dataset.hfxPart = 'step-state';
        const heading = item.panel.querySelector('[data-hfx-part="title"],h3');
        if (heading) heading.after(line); else item.panel.prepend(line);
        printStates.set(item.panel, line); inserted.add(line);
      }
      setText(printStates.get(item.panel), status(item));
      const heading = item.panel.querySelector('[data-hfx-part="title"],h3');
      if (heading && !printMarkers.has(item.panel)) {
        const marker = h('span', 'cx-step-marker cx-step-print-marker'); marker.setAttribute('aria-hidden', 'true');
        heading.prepend(marker); printMarkers.set(item.panel, marker); inserted.add(marker);
      }
      const printMarker = printMarkers.get(item.panel);
      if (printMarker) setText(printMarker, states.get(item.id) === 'done' ? '\u2713' : states.get(item.id) === 'error' ? '!' : states.get(item.id) === 'skipped' ? '\u2013' : item.index + 1);
      item.panel.hidden = item !== current;
      if (item.panel.dataset.state !== 'loading') item.panel.dataset.state = state;
      if (vertical && root.dataset.vertical === 'inline' && !narrow && item.panel.parentElement !== el) {
        if (!home.has(item.panel)) { const anchor = document.createComment('step panel'); item.panel.before(anchor); home.set(item.panel, anchor); }
        el.append(item.panel);
      } else if ((!vertical || root.dataset.vertical !== 'inline' || narrow) && home.has(item.panel)) home.get(item.panel).after(item.panel);
    }
  }
  function footerAction(action, visible, label) {
    if (!footer) return;
    let button = footer.querySelector('[data-cx-stepper-action="' + action + '"]');
    if (!button && visible) { button = n.button(label, ''); button.dataset.cxStepperAction = action; footer.append(button); inserted.add(button); }
    if (button) { button.hidden = !visible; setText(button, label); }
  }
  function update(nextItems = items, selected = current, nextStates = states, nextVisited = visited, canSelect = allowed, focus = false) {
    if (life.signal.aborted) return;
    const active = document.activeElement, ownedFocus = UI_TOOLS.owns(root, active);
    const navigationFocus = UI_TOOLS.owns(phone, active) || header?.contains(active) && !items.some(item => item.panel?.contains(active));
    items = nextItems; current = selected; states = nextStates; visited = nextVisited; allowed = canSelect;
    items.forEach(step);
    phone.hidden = !narrow; if (header) header.hidden = narrow;
    if (!current) return;
    const position = n.position(labels, 'stepperStepOf', current.index, items.length);
    picker.update({ lead: position, selected: current.id,
      items: n.pickerItems(items.map(item => ({ ...item, icon: states.get(item.id) === 'done' ? '\u2713' : states.get(item.id) === 'error' ? '!' : String(item.index + 1),
        badge: status(item) || undefined })), current.id, item => !allowed(item)) });
    backButton.hidden = !items.some(item => item.index < current.index && !item.disabled);
    const percentage = (current.index + 1) / items.length * 100;
    bar.style.inlineSize = percentage + '%'; progress.setAttribute('aria-valuenow', String(Math.round(percentage))); progress.setAttribute('aria-valuetext', position);
    const footerPosition = footer?.querySelector('.cx-step-position');
    if (footerPosition) setText(footerPosition, position);
    const last = !items.some(item => item.index > current.index && !item.disabled);
    const saveDraft = options.saveDraftLabel !== undefined ? options.saveDraftLabel != null
      : !!options.onSaveDraft || footerData.saveDraftEnabled === 'true' || originalButtons.has('save-draft');
    const skip = options.skip ?? (options.skipLabel !== undefined ? options.skipLabel != null : footerData.skipEnabled !== 'false');
    footerAction('save-draft', saveDraft, actionLabel('save-draft', 'saveDraftLabel', labels.stepperSaveDraft));
    footerAction('skip', current.optional && skip, actionLabel('skip', 'skipLabel', labels.stepperSkip));
    footerAction('back', items.some(item => item.index < current.index && !item.disabled), actionLabel('back', 'backLabel', labels.stepperBack));
    footerAction('next', !last, actionLabel('next', 'nextLabel', labels.stepperNext));
    footerAction('finish', last, actionLabel('finish', 'finishLabel', labels.stepperFinish));
    // DOM action order is stable even when buttons first appear on later steps.
    for (const action of ['save-draft', 'skip', 'back', 'next', 'finish']) {
      const button = footer?.querySelector('[data-cx-stepper-action="' + action + '"]'); if (button) footer.append(button);
    }
    if (focus) {
      const heading = current.panel?.querySelector('[data-hfx-part="title"],h1,h2,h3');
      if (heading) { heading.tabIndex = -1; heading.focus(); }
      if (live) setText(live, position + ': ' + current.label);
    } else if (ownedFocus && (document.activeElement !== active || !active.checkVisibility())) {
      // Moving an inline panel or ordering footer actions can also release focus.
      if (active.isConnected && active.checkVisibility()) active.focus({ preventScroll: true });
      else if (navigationFocus) {
        const target = narrow ? picker.element.querySelector('button')
          : current.panel?.querySelector('[data-hfx-part="title"],h1,h2,h3') || header?.querySelector('.cx-step-btn');
        if (target) { if (target.tagName !== 'BUTTON') target.tabIndex = -1; target.focus({ preventScroll: true }); }
      }
    }
  }
  UI_TOOLS.observe(root, width => {
    const measured = typeof width === 'number' ? width : root.getBoundingClientRect().width;
    narrow = measured < 640; root.dataset.phone = String(narrow);
    if (states) update();
  }, life.signal);
  function destroy() {
    for (const [panel, anchor] of home) { anchor.after(panel); anchor.remove(); }
    for (const [el, text] of descriptions) { const desc = el.querySelector('.cx-step-desc'); if (desc) setText(desc, text); }
    inserted.forEach(el => el.remove()); picker.destroy(); phone.remove();
    if (header) header.hidden = false;
    root.removeAttribute('data-finished');
    delete root.dataset.phone;
  }
  return { update, destroy };
};
