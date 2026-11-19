// Slides of any content in a scroll-snapped track, so touch and trackpad swipes are the browser's own. Previous and Next
// buttons, a picker with a button per slide and the arrow keys move between slides; slides outside the view are inert, so
// Tab never reaches hidden content. Nothing moves by itself unless the host asks for autoplay, which shows a Pause button,
// pauses on hover and focus and stays off under reduced motion (the WAI-ARIA carousel pattern).
UI_IMPL.carousel = (root, options = {}, signal) => {
  const labels = UI_TOOLS.labels(options.labels), data = root.dataset;
  const loop = options.loop ?? data.loop === 'true';
  const interval = options.autoplay === false ? 0 : Number(options.autoplay?.interval ?? data.autoplayInterval ?? 0);
  if (!Number.isFinite(interval) || interval < 0) throw new Error('CanopyX: the carousel autoplay interval must be positive milliseconds.');
  const perView = Number(options.perView ?? data.perView ?? 1);
  if (!Number.isInteger(perView) || perView < 1 || perView > 6) throw new Error('CanopyX: a carousel shows 1 to 6 slides at once.');
  const viewport = root.querySelector(':scope > .cx-carousel-viewport') || root;
  const track = viewport.querySelector(':scope > .cx-carousel-track');
  if (!track) throw new Error('CanopyX: a carousel needs a .cx-carousel-track list of slides.');
  root.classList.add('cx-carousel'); root.dataset.cxPart = 'carousel'; root.style.setProperty('--cx-carousel-per-view', String(perView));
  const restore = [];
  const attribute = (element, name, value) => { restore.push([element, name, element.getAttribute(name)]); element.setAttribute(name, value); };
  attribute(root, 'aria-roledescription', labels.carouselRole);
  if (!root.hasAttribute('aria-label') && !root.hasAttribute('aria-labelledby')) attribute(root, 'aria-label', labels.carouselRole);
  const controls = h('div', 'cx-carousel-controls'), previous = h('button', 'cx-carousel-step'), next = h('button', 'cx-carousel-step');
  const picker = h('div', 'cx-carousel-picker'), play = interval ? h('button', 'cx-carousel-play') : null;
  controls.dataset.cxPart = 'controls'; picker.dataset.cxPart = 'picker'; picker.setAttribute('role', 'group'); picker.setAttribute('aria-label', labels.carouselPicker);
  for (const [button, part, label] of [[previous, 'previous', labels.carouselPrevious], [next, 'next', labels.carouselNext]]) {
    button.type = 'button'; button.dataset.cxPart = part; button.setAttribute('aria-label', label); button.title = label;
  }
  if (play) { play.type = 'button'; play.dataset.cxPart = 'play'; }
  controls.append(...[play, previous, picker, next].filter(Boolean));
  root.insertBefore(controls, viewport === root ? track : viewport);
  // While slides move by themselves the viewport is not announced; otherwise each new slide is.
  attribute(viewport, 'aria-live', 'polite');
  // The track scrolls, so it takes focus: the arrow keys then move between slides even when no slide holds a control.
  if (!track.hasAttribute('tabindex')) attribute(track, 'tabindex', '0');
  let slides = [], index = 0, visible = 1, playing = false, timer = 0, hover = false, focus = false, frame = 0, aim = null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rtl = () => getComputedStyle(root).direction === 'rtl';
  const last = () => Math.max(0, slides.length - visible);

  /** Gives a slide back what the carousel changed: the attributes it set, inert and its state. */
  function release(slide) {
    slide.inert = false; delete slide.dataset.state; delete slide.dataset.cxSlide;
    for (const entry of restore.filter(([element]) => element === slide).reverse()) {
      const [, name, value] = entry;
      if (value === null) slide.removeAttribute(name); else slide.setAttribute(name, value);
      restore.splice(restore.indexOf(entry), 1);
    }
  }
  function discover() {
    const next = [...track.children].filter(item => item.nodeType === 1);
    // Slides the host took out of the track are released before the list forgets them.
    for (const slide of slides) if (!next.includes(slide)) release(slide);
    slides = next;
    slides.forEach((slide, at) => {
      slide.classList.add('cx-carousel-slide'); slide.dataset.cxPart = 'slide';
      if (!slide.dataset.cxSlide) {
        slide.dataset.cxSlide = 'true';
        for (const name of ['role', 'aria-roledescription', 'aria-label']) restore.push([slide, name, slide.getAttribute(name)]);
      }
      slide.setAttribute('role', 'group'); slide.setAttribute('aria-roledescription', labels.carouselSlideRole);
      if (!slide.dataset.label) slide.setAttribute('aria-label', fill(labels.carouselSlide, { current: at + 1, total: slides.length }));
      else slide.setAttribute('aria-label', slide.dataset.label);
    });
    picker.replaceChildren(...slides.map((slide, at) => {
      const dot = h('button', 'cx-carousel-dot'); dot.type = 'button'; dot.dataset.index = String(at);
      dot.setAttribute('aria-label', slide.getAttribute('aria-label'));
      dot.addEventListener('click', () => select(at, 'picker')); return dot;
    }));
  }
  // The slides that fit: a slide and its gap make one step, and the last slide needs no gap after it.
  function measure() {
    const width = track.clientWidth, slide = slides[0]?.getBoundingClientRect().width || width, gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    visible = Math.max(1, Math.min(slides.length, Math.floor((width + gap) / Math.max(1, slide + gap) + 0.01)));
  }
  function paint() {
    index = Math.max(0, Math.min(index, last()));
    slides.forEach((slide, at) => {
      const shown = at >= index && at < index + visible;
      slide.inert = !shown; slide.dataset.state = shown ? 'visible' : 'hidden';
    });
    [...picker.children].forEach((dot, at) => {
      if (at === index) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current');
      dot.hidden = at > last();
    });
    previous.disabled = !loop && index <= 0; next.disabled = !loop && index >= last();
    controls.hidden = slides.length <= visible;
    // Slides that move by themselves are not announced; once they stop, each slide the reader moves to is.
    viewport.setAttribute('aria-live', playing ? 'off' : 'polite');
    if (play) {
      const off = reduced.matches;
      play.disabled = off; play.dataset.state = playing ? 'playing' : 'paused';
      const label = off ? labels.carouselMotionDisabled : playing ? labels.tabsPause : labels.tabsPlay;
      play.setAttribute('aria-label', label); play.title = label;
    }
  }
  /** Scrolls the track so a slide sits at its start, as the stylesheet's scroll-behavior says: smoothly, or instantly under reduced motion. */
  function scrollTo(at) {
    const slide = slides[at];
    if (!slide) return;
    const start = track.getBoundingClientRect(), box = slide.getBoundingClientRect();
    const offset = rtl() ? box.right - start.right : box.left - start.left;
    if (Math.abs(offset) < 1) return;
    // While the track scrolls to a chosen slide, the slides it passes are not choices; the scroll ends at the aim.
    aim = at;
    track.scrollBy({ left: offset, behavior: reduced.matches ? 'instant' : 'auto' });
  }
  function select(at, source = 'api') {
    if (!slides.length) return false;
    const target = loop ? (at > last() ? 0 : at < 0 ? last() : at) : Math.max(0, Math.min(at, last()));
    const changed = target !== index;
    index = target; scrollTo(index); paint();
    if (changed) UI_TOOLS.emit(root, 'carousel', 'change', { index, total: slides.length, source });
    // Any choice by the reader stops autoplay; they decide what shows from now on.
    if (playing && !['autoplay', 'api'].includes(source)) stop();
    return changed;
  }
  // A swipe or scroll by the reader settles on the slide nearest the start edge.
  function settle() {
    frame = 0;
    const box = track.getBoundingClientRect(), edge = rtl() ? box.right : box.left;
    let nearest = index, distance = Infinity;
    slides.forEach((slide, at) => {
      const rect = slide.getBoundingClientRect(), gap = Math.abs((rtl() ? rect.right : rect.left) - edge);
      if (gap < distance) { distance = gap; nearest = at; }
    });
    nearest = Math.min(nearest, last());
    if (aim !== null) { if (nearest === aim) aim = null; return; }
    if (nearest === index) return;
    index = nearest; paint();
    UI_TOOLS.emit(root, 'carousel', 'change', { index, total: slides.length, source: 'swipe' });
    if (playing) stop();
  }
  function schedule() {
    clearTimeout(timer); timer = 0;
    if (!playing || hover || focus || document.hidden || reduced.matches) return;
    timer = setTimeout(() => { select(index >= last() ? 0 : index + 1, 'autoplay'); schedule(); }, interval);
  }
  const start = () => { if (!interval || reduced.matches) return false; playing = true; paint(); schedule(); return true; };
  const stop = () => { playing = false; clearTimeout(timer); timer = 0; paint(); return true; };

  previous.addEventListener('click', () => select(index - 1, 'button'), { signal });
  next.addEventListener('click', () => select(index + 1, 'button'), { signal });
  play?.addEventListener('click', () => playing ? stop() : start(), { signal });
  track.addEventListener('scroll', () => { frame ||= requestAnimationFrame(settle); }, { signal, passive: true });
  // A scroll that ends away from its aim was taken over by the reader: where it stopped is their choice.
  track.addEventListener('scrollend', () => { aim = null; cancelAnimationFrame(frame); settle(); }, { signal });
  root.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable]')) return;
    const back = rtl() ? 'ArrowRight' : 'ArrowLeft', forward = rtl() ? 'ArrowLeft' : 'ArrowRight';
    const move = { [back]: index - 1, [forward]: index + 1, Home: 0, End: last() }[event.key];
    if (move === undefined) return;
    event.preventDefault(); select(move, 'keyboard');
    if (picker.contains(event.target)) picker.children[index]?.focus();
  }, { signal });
  root.addEventListener('pointerenter', () => { hover = true; schedule(); }, { signal });
  root.addEventListener('pointerleave', () => { hover = false; schedule(); }, { signal });
  root.addEventListener('focusin', () => { focus = true; schedule(); }, { signal });
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) { focus = false; schedule(); } }, { signal });
  document.addEventListener('visibilitychange', schedule, { signal });
  reduced.addEventListener('change', () => { if (reduced.matches) stop(); else paint(); }, { signal });
  UI_TOOLS.observe(track, () => { measure(); paint(); scrollTo(index); }, signal);
  signal?.addEventListener('abort', () => {
    clearTimeout(timer); cancelAnimationFrame(frame); controls.remove(); root.style.removeProperty('--cx-carousel-per-view');
    for (const slide of slides) release(slide);
    for (const [element, name, value] of restore.reverse()) if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
  }, { once: true });
  discover(); measure();
  const initial = Number(options.selected ?? data.selected ?? 0);
  index = Number.isInteger(initial) ? Math.max(0, initial) : 0;
  paint(); scrollTo(index);
  if (interval && (options.autoplay?.start ?? data.autoplayStart) !== false && data.autoplayStart !== 'false') start();
  return {
    select: at => select(at, 'api'), next: () => select(index + 1, 'api'), back: () => select(index - 1, 'api'),
    play: start, pause: stop, refresh: () => { discover(); measure(); paint(); },
    getState: () => ({ index, total: slides.length, visible, playing })
  };
};
