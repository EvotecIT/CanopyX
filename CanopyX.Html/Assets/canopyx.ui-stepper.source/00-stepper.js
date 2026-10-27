UI_IMPL.stepper = (root, options = {}, signal) => {
  const n = UI_TOOLS.navigation, life = n.scope(signal), labels = UI_TOOLS.labels(options.labels);
  const mode = options.mode || root.dataset.mode || 'interactive';
  const linear = options.linear ?? root.dataset.linear !== 'false';
  let items = n.records(root, 'stepper', options);
  let current = n.resolve(items, options.selectedIndex ?? options.selected) || items.find(item => item.element.hasAttribute('aria-current')) || items.find(item => !item.disabled);
  if (current?.disabled) current = items.find(item => !item.disabled);
  let destroyed = false, completed = false, view, finishSelection;
  root.dataset.mode = mode;
  const states = new Map(items.map(item => [item.id, item.state === 'current' ? 'upcoming' : item.state]));
  const visited = new Set(items.filter(item => item.visited || item.index < (current?.index ?? 0) || ['done', 'error', 'skipped'].includes(item.state)).map(item => item.id));
  if (current) visited.add(current.id);
  function syncRecords() {
    items.forEach(item => {
      item.state = item === current && !completed && states.get(item.id) !== 'error' ? 'current' : states.get(item.id);
      item.visited = visited.has(item.id);
    });
    return current;
  }
  function getState() {
    syncRecords();
    return { selected: current?.id ?? null, finished: completed,
      steps: items.map(item => ({ id: item.id, state: item.state, current: item === current, visited: item.visited, optional: item.optional })) };
  }
  function allowed(item) { return !!item && !item.disabled && (!linear || item === current || visited.has(item.id) || ['done', 'error', 'skipped'].includes(states.get(item.id))); }
  // Report and static markup deliberately remain readable without runtime controls.
  if (mode !== 'interactive') return { select: async () => false, getSelected: () => current?.id ?? null,
    refresh() {}, destroy() { life.abort(); }, preparePrint: async () => {}, next: async () => false, back: async () => false,
    skip: async () => false, finish: async () => false, setStepState() { return false; }, getState, ready: Promise.resolve() };
  const errors = UI_TOOLS.stepperErrors(root, labels);
  const deferred = n.deferred(root, 'stepper', options, life, id => select(id, 'retry'));
  function render(focus = false) { syncRecords(); root.dataset.finished = String(completed); view?.update(items, current, states, visited, allowed, focus); }
  function adjacent(direction) {
    for (let index = (current?.index ?? 0) + direction; index >= 0 && index < items.length; index += direction) {
      if (!items[index].disabled) return items[index];
    }
    return null;
  }
  const selection = n.selection(root, 'stepper', options, life, syncRecords, async (from, to, loadSignal, live, source) => {
    if (from !== to) {
      deferred.leave(from);
      if (source === 'next' || source === 'skip') { states.set(from.id, source === 'skip' ? 'skipped' : 'done'); errors.clear(from); }
      if (options.resetForwardOnBack && to.index < from.index) {
        items.filter(item => item.index > to.index).forEach(item => {
          if (states.get(item.id) !== 'disabled') states.set(item.id, 'upcoming');
          visited.delete(item.id); errors.clear(item);
        });
      }
    }
    current = to; visited.add(to.id); completed = false;
    render(from !== to);
    if (from !== to) UI_TOOLS.emit(root, 'stepper', 'change', { from, to, state: getState() });
    await deferred.load(to, loadSignal, live);
    if (live()) render();
  });
  async function validate(item, validationSignal, live) {
    syncRecords();
    const result = await options.validate?.(item, validationSignal);
    if (!live()) return false;
    if (result === false || Array.isArray(result) && result.length) {
      states.set(item.id, 'error');
      errors.show(item, Array.isArray(result) ? result : [labels.stateDetails]);
      render(); errors.focus(item);
      return false;
    }
    errors.clear(item);
    return true;
  }
  function select(value, source = 'api') {
    if (destroyed) return Promise.resolve(false);
    finishSelection?.cancel();
    const target = n.resolve(items, value);
    if (!allowed(target) && source !== 'next' && source !== 'skip') { selection.cancel(); return Promise.resolve(false); }
    if (target === current && source !== 'retry') { selection.cancel(); return Promise.resolve(true); }
    return selection.request(target, async (from, to, requestSignal, live) => {
      if (source === 'next' && !await validate(from, requestSignal, live)) return false;
      return true;
    }, source);
  }
  // Progress states change only on a successful leave; cancelling beforeChange
  // cannot mark an uncompleted step done or skipped.
  async function move(source) {
    const to = adjacent(1);
    if (!to) return source === 'skip' ? Promise.resolve(false) : finish();
    return select(to.id, source);
  }
  const next = () => move('next');
  const back = () => { const target = adjacent(-1); return target ? select(target.id, 'back') : Promise.resolve(false); };
  const skip = () => current?.optional ? move('skip') : Promise.resolve(false);
  // Finishing uses a separate commit projection while retaining the shared
  // cancellation/guard contract (and never emits a false navigation change).
  finishSelection = n.selection(root, 'stepper', options, life, syncRecords, async (from, to, finishSignal, live) => {
    if (!live()) return;
    states.set(to.id, 'done'); completed = true; render();
    UI_TOOLS.emit(root, 'stepper', 'finish', { step: to, state: getState(), signal: finishSignal });
    options.onFinish?.(getState());
  });
  async function finish() {
    if (destroyed || !current || adjacent(1)) return false;
    selection.cancel();
    if (completed) return false;
    return finishSelection.request(current, (from, to, requestSignal, live) => validate(to, requestSignal, live), 'finish');
  }
  function setStepState(value, state) {
    const item = n.resolve(items, value);
    if (!item || !['upcoming', 'current', 'done', 'error', 'skipped', 'disabled'].includes(state) || state === 'skipped' && !item.optional || state === 'current' && item !== current || state === 'disabled' && item === current) return false;
    selection.cancel(); finishSelection.cancel();
    completed = false;
    item.disabled = state === 'disabled'; states.set(item.id, state === 'current' ? 'upcoming' : state);
    if (['done', 'error', 'skipped'].includes(state)) visited.add(item.id);
    render(); return true;
  }
  function refresh() {
    if (destroyed) return;
    selection.cancel(); finishSelection.cancel();
    const selected = current?.id;
    items = n.records(root, 'stepper', options);
    items.forEach(item => { if (!states.has(item.id)) states.set(item.id, item.state === 'current' ? 'upcoming' : item.state); });
    current = n.resolve(items, selected) || items.find(item => !item.disabled);
    if (current) visited.add(current.id);
    render();
  }
  root.addEventListener('click', event => {
    const action = event.target.closest('[data-cx-stepper-action]');
    if (action && action.closest('[data-cx-stepper]') === root) {
      if (action.getAttribute('aria-disabled') === 'true') return;
      const actions = { next, back, skip, finish, 'save-draft': () => {
        UI_TOOLS.emit(root, 'stepper', 'savedraft', { state: getState() }); options.onSaveDraft?.(getState());
      } };
      actions[action.dataset.cxStepperAction]?.(); return;
    }
    const button = event.target.closest('.cx-step-btn');
    if (button && button.closest('[data-cx-stepper]') === root) select(button.closest('[data-step-id]').dataset.stepId, 'user');
  }, { signal: life.signal });
  view = UI_TOOLS.stepperView(root, options, labels, life, id => select(id, 'picker'), back, errors.count);
  function destroy() {
    if (destroyed) return;
    destroyed = true; life.abort(); view.destroy(); deferred.destroy(); errors.destroy();
    root.removeAttribute('data-cx-ready'); items.forEach(item => { if (item.panel) item.panel.hidden = false; });
  }
  root.dataset.cxReady = 'true'; render();
  const ready = current ? select(current.id, 'retry') : Promise.resolve(false);
  signal?.addEventListener('abort', destroy, { once: true });
  return { select, getSelected: () => current?.id ?? null, refresh, destroy, next, back, skip, finish, setStepState, getState, ready,
    preparePrint: () => deferred.preparePrint() };
};
