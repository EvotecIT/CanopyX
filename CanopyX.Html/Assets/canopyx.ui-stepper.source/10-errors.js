UI_TOOLS.stepperErrors = (root, labels) => {
  const alerts = new Map(), fields = new Map();
  function clear(item) {
    const entry = alerts.get(item?.id);
    if (!entry) return;
    for (const field of fields.get(item.id) || []) {
      const ids = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== entry.element.id);
      if (ids.length) field.setAttribute('aria-describedby', ids.join(' ')); else field.removeAttribute('aria-describedby');
    }
    entry.element.remove(); alerts.delete(item.id); fields.delete(item.id);
  }
  function show(item, messages) {
    clear(item);
    if (!item.panel) return;
    const alert = h('div', 'cx-step-errors'); alert.setAttribute('role', 'alert'); alert.tabIndex = -1;
    alert.id = item.panel.id + '-validation';
    const heading = h('p');
    setText(heading, messages.length === 1 ? labels.stepperIssue : fill(labels.stepperIssues, { count: messages.length }));
    const list = h('ul');
    for (const message of messages) { const entry = h('li'); setText(entry, message); list.append(entry); }
    alert.append(heading, list); item.panel.prepend(alert);
    const invalid = Array.from(item.panel.querySelectorAll('[aria-invalid="true"],input:invalid,select:invalid,textarea:invalid'));
    for (const field of invalid) {
      const ids = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      ids.add(alert.id); field.setAttribute('aria-describedby', Array.from(ids).join(' '));
    }
    alerts.set(item.id, { element: alert, count: messages.length }); fields.set(item.id, invalid);
  }
  return { show, clear, focus: item => alerts.get(item.id)?.element.focus(), count: item => alerts.get(item.id)?.count || 0,
    destroy() { for (const id of Array.from(alerts.keys())) clear({ id }); } };
};
