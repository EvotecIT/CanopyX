UI_TOOLS.tabsAuto = (root, list, options, labels, life, read, select) => {
  const config = options.autoAdvance;
  if (!config || !Number.isFinite(config.interval) || config.interval <= 0) return { stop() {}, reset() {}, destroy() {} };
  const n = UI_TOOLS.navigation, control = n.button(labels.tabsPause, 'cx-tabs-play');
  const progress = h('span', 'cx-tabs-progress'); progress.setAttribute('aria-hidden', 'true');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false, stopped = false, hovered = false, focused = false, pending = false;
  let elapsed = 0, previous, frame;
  const tools = n.owned(root, '.cx-tabs-tools')[0];
  if (tools) tools.append(control); else list?.after(control);
  function paint() {
    setText(control, paused || stopped ? labels.tabsPlay : labels.tabsPause);
    control.setAttribute('aria-label', control.textContent);
    control.setAttribute('aria-pressed', String(!paused && !stopped));
  }
  function blocked() { return paused || stopped || hovered || focused || document.hidden || pending; }
  async function advance() {
    const { items, current } = read(), enabled = items.filter(item => !item.disabled);
    const index = enabled.indexOf(current), next = enabled[index + 1] || (config.loop !== false ? enabled[0] : null);
    if (!next || next === current) { paused = true; paint(); return; }
    pending = true;
    const changed = await select(next.id);
    pending = false; elapsed = 0;
    if (!changed) { paused = true; paint(); }
  }
  function tick(now) {
    if (life.signal.aborted) return;
    const { current } = read();
    if (current && progress.parentElement !== current.element) current.element.append(progress);
    if (previous != null && !blocked()) elapsed += now - previous;
    previous = now;
    // Reduced motion keeps discrete progress; no continuous animated fill.
    progress.style.inlineSize = (media.matches ? 0 : Math.min(100, elapsed / config.interval * 100)) + '%';
    if (!blocked() && elapsed >= config.interval) advance();
    frame = requestAnimationFrame(tick);
  }
  control.addEventListener('click', () => { stopped = false; paused = !paused; elapsed = 0; paint(); }, { signal: life.signal });
  if (config.pauseOnHover !== false) {
    root.addEventListener('pointerenter', () => { hovered = true; }, { signal: life.signal });
    root.addEventListener('pointerleave', () => { hovered = false; previous = null; }, { signal: life.signal });
  }
  if (config.pauseOnFocus !== false) {
    root.addEventListener('focusin', () => { focused = true; }, { signal: life.signal });
    root.addEventListener('focusout', event => { focused = root.contains(event.relatedTarget); previous = null; }, { signal: life.signal });
  }
  document.addEventListener('visibilitychange', () => { previous = null; }, { signal: life.signal });
  function stop() { stopped = true; paused = true; elapsed = 0; paint(); }
  function reset() { elapsed = 0; previous = null; }
  function destroy() { cancelAnimationFrame(frame); control.remove(); progress.remove(); }
  life.signal.addEventListener('abort', destroy, { once: true });
  paint(); frame = requestAnimationFrame(tick);
  return { stop, reset, destroy };
};
