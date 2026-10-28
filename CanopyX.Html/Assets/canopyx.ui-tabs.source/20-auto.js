UI_TOOLS.tabsAuto = (root, list, options, labels, life, read, select, cancel, ready) => {
  const config = options.autoProgress === undefined
    ? root.dataset.autoProgressInterval === undefined ? null : {
      interval: Number(root.dataset.autoProgressInterval),
      pauseOnHover: root.dataset.autoProgressPauseOnHover !== 'false',
      pauseOnFocus: root.dataset.autoProgressPauseOnFocus !== 'false'
    } : options.autoProgress;
  const idle = { stop() {}, reset() {}, destroy() {} };
  if (!config || !Number.isFinite(config.interval) || config.interval <= 0 || life.signal.aborted) return idle;
  const n = UI_TOOLS.navigation, control = n.button(labels.tabsPause, 'cx-tabs-play');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = media.matches, paused = reduced, hovered = config.pauseOnHover !== false && root.matches(':hover');
  let focused = config.pauseOnFocus !== false && root.contains(document.activeElement);
  let started = false, pending = false, destroyed = false, generation = 0;
  let elapsed = 0, previous = null, frame = null;
  const tools = n.owned(root, '.cx-tabs-tools')[0];
  if (tools) tools.append(control); else list?.after(control);
  function paint() {
    // Touch the label only when it changes: replacing the text under the pointer between mousedown and mouseup (focusin
    // repaints, and WebKit on Linux focuses buttons on mousedown) makes WebKit drop the click.
    const label = paused || media.matches ? labels.tabsPlay : labels.tabsPause;
    if (control.textContent !== label) setText(control, label);
    if (control.getAttribute('aria-label') !== label) control.setAttribute('aria-label', label);
    control.dataset.state = paused || media.matches ? 'paused' : 'playing';
    control.disabled = media.matches;
    if (media.matches) {
      control.setAttribute('title', labels.tabsMotionDisabled);
      control.setAttribute('aria-description', labels.tabsMotionDisabled);
    } else {
      control.removeAttribute('title'); control.removeAttribute('aria-description');
    }
  }
  function blocked() {
    return destroyed || life.signal.aborted || !started || paused || media.matches || hovered || focused || document.hidden || pending;
  }
  function schedule() { if (frame == null && !blocked()) frame = requestAnimationFrame(tick); }
  function sync() {
    if (pending && (hovered || focused || document.hidden)) cancelPending();
    previous = null;
    if (blocked()) { cancelAnimationFrame(frame); frame = null; }
    else schedule();
    paint();
  }
  // Only cancel a request made by this timer. Initial and manual requests keep
  // their existing selection/deferred ownership and lifetime.
  function cancelPending() {
    generation++;
    if (pending) { pending = false; cancel(); }
  }
  async function advance() {
    const { items, current } = read(), enabled = items.filter(item => !item.disabled);
    const next = enabled[(enabled.indexOf(current) + 1) % enabled.length];
    if (!next || next === current) { stop(); return; }
    const ticket = ++generation;
    pending = true; previous = null;
    let changed = false;
    try { changed = await select(next.id); }
    finally {
      if (ticket === generation && !destroyed && !life.signal.aborted) {
        pending = false; elapsed = 0;
        if (!changed) paused = true;
        sync();
      }
    }
  }
  function tick(now) {
    frame = null;
    // Reading media.matches can update the value Chromium compares for its change event, so that event may never come;
    // a running timer also notices the switch itself.
    if (media.matches !== reduced) { motionChanged(); return; }
    if (blocked()) { previous = null; return; }
    if (previous != null) elapsed += now - previous;
    previous = now; paint();
    if (elapsed >= config.interval) { elapsed = 0; void advance(); }
    else schedule();
  }
  control.addEventListener('click', () => {
    if (media.matches || destroyed) return;
    if (!paused) stop();
    else { paused = false; elapsed = 0; sync(); }
  }, { signal: life.signal });
  if (config.pauseOnHover !== false) {
    root.addEventListener('pointerenter', () => { hovered = true; sync(); }, { signal: life.signal });
    root.addEventListener('pointerleave', () => { hovered = false; sync(); }, { signal: life.signal });
  }
  if (config.pauseOnFocus !== false) {
    root.addEventListener('focusin', () => { focused = true; sync(); }, { signal: life.signal });
    root.addEventListener('focusout', event => { focused = root.contains(event.relatedTarget); sync(); }, { signal: life.signal });
  }
  document.addEventListener('visibilitychange', sync, { signal: life.signal });
  function motionChanged() {
    if (media.matches === reduced) return;
    reduced = media.matches;
    if (reduced) stop();
    else sync();
  }
  media.addEventListener('change', motionChanged, { signal: life.signal });
  function stop() { cancelPending(); paused = true; elapsed = 0; sync(); }
  function reset() { cancelPending(); elapsed = 0; sync(); }
  function destroy() {
    if (destroyed) return;
    destroyed = true; cancelPending(); cancelAnimationFrame(frame); frame = null;
    control.remove();
  }
  life.signal.addEventListener('abort', destroy, { once: true });
  // Do not race the initially selected panel's guard or deferred loader.
  Promise.resolve(ready).then(() => {
    if (!destroyed && !life.signal.aborted) { started = true; sync(); }
  }, () => { if (!destroyed && !life.signal.aborted) stop(); });
  paint();
  return { stop, reset, destroy };
};
