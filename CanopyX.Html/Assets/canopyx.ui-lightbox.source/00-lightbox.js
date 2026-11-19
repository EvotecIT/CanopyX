// A gallery's links open their items in a modal viewer: the overlay manager's native dialog, with focus trapping, Escape,
// scroll locking and focus return. Items are images, content (a template or element on the page, or a host Node or HTML)
// or frames. The viewer moves with the arrow keys, swipes, Home and End; zooms with + and -, 0, double-click and its buttons;
// and pans a zoomed image by scrolling or dragging. Without the runtime, each link still opens its item.
const LIGHTBOX_ZOOMS = [1, 1.5, 2, 3, 4];
// Browsers drop tabs and line breaks from addresses and ignore leading spaces, so a scheme is read as they read it.
const lightboxScript = src => /^(?:javascript|vbscript):/i.test(String(src).replace(/[\u0000-\u0020\u007f]/g, ''));

function lightboxItem(raw, index) {
  if (!raw || typeof raw !== 'object') throw new Error('CanopyX: a lightbox item needs a src or content.');
  const type = raw.type ?? (raw.content !== undefined ? 'content' : 'image');
  if (!['image', 'content', 'frame', 'video', 'youtube'].includes(type)) throw new Error('CanopyX: unknown lightbox item type.');
  if (type !== 'content' && (typeof raw.src !== 'string' || !raw.src)) throw new Error('CanopyX: lightbox item ' + index + ' needs a src.');
  if (type !== 'content' && lightboxScript(raw.src)) throw new Error('CanopyX: lightbox item ' + index + ' has a script address.');
  if (type === 'youtube' && !lightboxYouTubeId(raw.src)) throw new Error('CanopyX: lightbox item ' + index + ' is not a YouTube address.');
  if (raw.poster != null && (typeof raw.poster !== 'string' || lightboxScript(raw.poster))) throw new Error('CanopyX: lightbox item ' + index + ' has an unsafe poster.');
  return { id: raw.id == null ? String(index) : String(raw.id), type, src: raw.src ?? null, alt: raw.alt ?? '', caption: raw.caption ?? '',
    content: raw.content, trigger: raw.trigger ?? null, poster: raw.poster ?? null, autoplay: raw.autoplay === true };
}
/** Reads a gallery link: its address, type, caption (data-caption, the figure's caption or the image's alt) and alt text. */
function lightboxLinkItem(link, index) {
  const image = link.querySelector('img'), href = link.getAttribute('href') || link.dataset.lightboxSrc || '', text = link.textContent.trim();
  const type = link.dataset.lightboxType || (href.startsWith('#') ? 'content' : 'image');
  const caption = link.dataset.caption ?? link.closest('figure')?.querySelector('figcaption')?.textContent.trim() ?? image?.alt ?? '';
  let content;
  if (type === 'content') {
    const source = document.getElementById(decodeURIComponent(href.slice(1)));
    content = () => source?.localName === 'template' ? source.content.cloneNode(true) : source?.cloneNode(true) ?? null;
  }
  // A text-only link (a frame or content item without a thumbnail) names its item with its own text.
  return lightboxItem({ id: link.dataset.lightboxId ?? index, type, src: type === 'content' ? null : type === 'youtube' ? href : link.href || href, alt: image?.alt || caption || text, caption, content, trigger: link,
    poster: link.dataset.poster || (type === 'video' ? image?.getAttribute('src') : undefined), autoplay: link.dataset.autoplay === 'true' }, index);
}

UI_IMPL.lightbox = (root, options = {}, signal) => {
  const labels = UI_TOOLS.labels(options.labels), loop = options.loop ?? root.dataset.loop === 'true';
  const links = () => [...root.querySelectorAll('[data-lightbox-item]')];
  const items = () => options.items ? options.items.map(lightboxItem) : links().map(lightboxLinkItem);
  if (options.items !== undefined && !Array.isArray(options.items)) throw new Error('CanopyX: lightbox items must be a list.');
  items();
  const dialog = h('dialog', 'cx-dialog cx-lightbox'), header = h('header', 'cx-lightbox-header'), title = h('h2', 'cx-lightbox-title');
  const position = h('span', 'cx-lightbox-position'), tools = h('div', 'cx-lightbox-tools'), level = h('span', 'cx-lightbox-zoom');
  const stage = h('div', 'cx-lightbox-stage'), caption = h('p', 'cx-lightbox-caption'), status = h('p', 'cx-lightbox-status');
  const id = (root.id || 'cx-lightbox-' + Math.random().toString(36).slice(2)) + '-viewer';
  const button = (label, part, run) => {
    const element = h('button', 'cx-lightbox-button'); element.type = 'button'; element.dataset.cxPart = part;
    element.setAttribute('aria-label', label); element.title = label; element.addEventListener('click', run); return element;
  };
  const zoomOut = button(labels.lightboxZoomOut, 'zoom-out', () => zoom(step(-1)));
  const zoomIn = button(labels.lightboxZoomIn, 'zoom-in', () => zoom(step(1)));
  const reset = button(labels.lightboxZoomReset, 'zoom-reset', () => zoom(1));
  const close = button(labels.dialogClose, 'close', () => overlay.close('cancel'));
  const previous = button(labels.lightboxPrevious, 'previous', () => move(-1)), next = button(labels.lightboxNext, 'next', () => move(1));
  close.classList.add('cx-overlay-close');
  dialog.id = id; dialog.dataset.cxPart = 'lightbox'; dialog.dataset.state = 'closed'; dialog.hidden = true;
  dialog.setAttribute('aria-labelledby', id + '-title'); dialog.setAttribute('aria-describedby', id + '-caption');
  title.id = id + '-title'; title.dataset.cxPart = 'title'; caption.id = id + '-caption'; caption.dataset.cxPart = 'caption';
  position.dataset.cxPart = 'position'; position.setAttribute('aria-live', 'polite'); level.dataset.cxPart = 'zoom'; level.setAttribute('aria-live', 'polite');
  stage.dataset.cxPart = 'stage'; status.dataset.cxPart = 'status'; status.setAttribute('role', 'status');
  tools.append(zoomOut, level, zoomIn, reset);
  header.append(title, position, tools, close);
  const body = h('div', 'cx-lightbox-body');
  previous.classList.add('cx-lightbox-step'); next.classList.add('cx-lightbox-step');
  body.append(previous, stage, next);
  dialog.append(header, body, caption, status);
  root.append(dialog);
  const overlay = UI_TOOLS.overlay(dialog, { kind: 'lightbox', host: root, initialFocus: element => element }, signal);
  let list = [], index = -1, scale = 1, media = null, generation = 0, fitted = null;
  const rtl = () => getComputedStyle(root).direction === 'rtl';
  const step = direction => LIGHTBOX_ZOOMS[Math.max(0, Math.min(LIGHTBOX_ZOOMS.length - 1, LIGHTBOX_ZOOMS.findIndex(value => value >= scale) + direction))] ?? 1;
  const percent = value => new Intl.NumberFormat(document.documentElement.lang || undefined, { style: 'percent' }).format(value);

  function zoom(value) {
    if (!media || media.localName !== 'img' || !media.complete || !media.naturalWidth) return scale;
    const target = Math.max(1, Math.min(LIGHTBOX_ZOOMS.at(-1), Number(value) || 1));
    // Zoom keeps the point in the middle of the stage where it was: a fraction of the image before, the same fraction after.
    const centre = { x: (stage.scrollLeft + stage.clientWidth / 2) / Math.max(1, stage.scrollWidth), y: (stage.scrollTop + stage.clientHeight / 2) / Math.max(1, stage.scrollHeight) };
    // Zoom steps multiply the fitted size, measured when the image last showed whole; the layout size ignores the opening animation.
    if (scale === 1) fitted = { width: media.offsetWidth, height: media.offsetHeight };
    if (target === 1) { media.style.removeProperty('inline-size'); media.style.removeProperty('block-size'); }
    else { media.style.setProperty('inline-size', fitted.width * target + 'px'); media.style.setProperty('block-size', fitted.height * target + 'px'); }
    scale = target; dialog.dataset.zoomed = String(scale > 1);
    stage.scrollLeft = centre.x * stage.scrollWidth - stage.clientWidth / 2; stage.scrollTop = centre.y * stage.scrollHeight - stage.clientHeight / 2;
    // A zoomed stage takes focus, so the arrow keys and Page keys pan it.
    stage.tabIndex = scale > 1 ? 0 : -1;
    paintZoom();
    return scale;
  }
  function paintZoom() {
    const image = media?.localName === 'img' && !status.dataset.error;
    // Hiding the zoom tools would drop a focused zoom button out of the viewer, so the viewer takes focus first.
    if (!image && tools.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    tools.hidden = !image;
    setText(level, percent(scale));
    const focused = [zoomOut, zoomIn, reset].find(button => button === document.activeElement);
    zoomOut.disabled = scale <= 1; reset.disabled = scale <= 1; zoomIn.disabled = scale >= LIGHTBOX_ZOOMS.at(-1);
    // A zoom button that becomes disabled while it has focus hands focus to the viewer, as the step buttons do.
    if (focused?.disabled) dialog.focus({ preventScroll: true });
  }
  function fail() {
    status.dataset.error = 'true'; status.className = 'cx-lightbox-status cx-overlay-error'; setText(status, labels.lightboxError); paintZoom();
  }
  function show(at, source = 'api') {
    if (!list.length) return false;
    index = loop ? (at + list.length) % list.length : Math.max(0, Math.min(list.length - 1, at));
    const item = list[index], current = ++generation;
    lightboxStop(media);
    scale = 1; dialog.dataset.zoomed = 'false'; stage.tabIndex = -1; delete status.dataset.error; status.className = 'cx-lightbox-status'; setText(status, '');
    dialog.dataset.type = item.type;
    setText(title, item.caption || item.alt || labels.lightboxTitle);
    setText(caption, item.caption && item.caption !== title.textContent ? item.caption : '');
    caption.hidden = !caption.textContent;
    setText(position, list.length > 1 ? fill(labels.tabsPosition, { current: index + 1, total: list.length }) : '');
    previous.hidden = next.hidden = list.length < 2;
    // A step button that becomes disabled while it has focus hands focus to the viewer, so the arrow keys keep working.
    const focused = [previous, next].find(button => button === document.activeElement);
    previous.disabled = !loop && index === 0; next.disabled = !loop && index === list.length - 1;
    if (focused?.disabled) dialog.focus({ preventScroll: true });
    if (item.type === 'image') {
      media = h('img', 'cx-lightbox-image'); media.alt = item.alt; media.decoding = 'async'; media.draggable = false;
      setText(status, labels.stateLoading);
      media.addEventListener('load', () => { if (current === generation) { setText(status, ''); paintZoom(); } });
      media.addEventListener('error', () => { if (current === generation) fail(); });
      media.src = item.src;
    } else if (item.type === 'video' || item.type === 'youtube') {
      media = lightboxVideo(item, item.caption || item.alt || labels.lightboxTitle);
      if (item.type === 'video') media.addEventListener('error', () => { if (current === generation) fail(); });
    } else if (item.type === 'frame') {
      media = h('iframe', 'cx-lightbox-frame'); media.src = item.src; media.title = item.caption || item.alt || labels.lightboxTitle;
      media.setAttribute('allowfullscreen', '');
    } else {
      media = h('div', 'cx-lightbox-content');
      const value = typeof item.content === 'function' ? item.content() : item.content;
      if (value == null) fail(); else UI_TOOLS.content(media, value);
    }
    media.dataset.cxPart = 'media';
    // Focus inside the item being replaced would fall to the page, and the keys would stop reaching the viewer.
    if (stage.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    stage.replaceChildren(media); stage.scrollTop = stage.scrollLeft = 0;
    paintZoom();
    // The neighbours load ahead, so moving through a gallery does not wait.
    for (const near of [list[index + 1], list[index - 1]]) if (near?.type === 'image') new Image().src = near.src;
    UI_TOOLS.emit(root, 'lightbox', 'change', { index, item: { id: item.id, type: item.type, src: item.src, caption: item.caption }, source });
    return true;
  }
  function open(target = 0, settings = {}) {
    list = items();
    const at = typeof target === 'number' ? target : list.findIndex(item => item.id === String(target));
    if (at < 0 || at >= list.length) throw new Error('CanopyX: the lightbox has no item ' + target + '.');
    const returnFocus = settings.returnFocus || list[at].trigger;
    // An open viewer that shows another item returns focus to that item's control when it closes.
    if (overlay.opened) overlay.setReturnFocus(returnFocus);
    else if (!overlay.open({ modal: true, returnFocus: returnFocus || document.activeElement })) return false;
    return show(at, settings.source || 'api');
  }
  function move(direction) {
    if (!overlay.opened || list.length < 2) return false;
    if (!loop && (index + direction < 0 || index + direction >= list.length)) return false;
    return show(index + direction, 'navigation');
  }

  root.addEventListener('click', event => {
    const link = event.target.closest?.('[data-lightbox-item]');
    if (!link || options.items || !root.contains(link) || dialog.contains(link) || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(links().indexOf(link), { returnFocus: link, source: 'link' });
  }, { signal });
  dialog.addEventListener('keydown', event => {
    // Keys typed into a field, an editable element or a frame belong to them, shortcuts included.
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('iframe,video,audio,input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    const back = rtl() ? 'ArrowRight' : 'ArrowLeft', forward = rtl() ? 'ArrowLeft' : 'ArrowRight';
    const keys = { '+': () => zoom(step(1)), '=': () => zoom(step(1)), '-': () => zoom(step(-1)), '0': () => zoom(1) };
    // While zoomed the arrows pan the stage; the Previous and Next buttons still move.
    if (scale <= 1) Object.assign(keys, { [back]: () => move(-1), [forward]: () => move(1),
      Home: () => show(0, 'navigation'), End: () => show(list.length - 1, 'navigation') });
    if (!keys[event.key]) return;
    event.preventDefault(); keys[event.key]();
  }, { signal });
  stage.addEventListener('dblclick', () => zoom(scale > 1 ? 1 : 2), { signal });
  // A swipe moves between items; on a zoomed image a drag pans it instead.
  let drag = null;
  stage.addEventListener('pointerdown', event => {
    // Gestures on host controls and editable content belong to them, not to swipe navigation.
    if (event.button || media?.localName === 'iframe' || media?.localName === 'video' || event.target.closest('input,select,textarea,button,a[href],label,[contenteditable]:not([contenteditable="false"])')) return;
    drag = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop, pointer: event.pointerId };
    if (scale > 1 && event.pointerType === 'mouse') { stage.setPointerCapture(event.pointerId); dialog.dataset.panning = 'true'; }
  }, { signal });
  stage.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId || scale <= 1 || event.pointerType !== 'mouse') return;
    stage.scrollLeft = drag.left - (event.clientX - drag.x); stage.scrollTop = drag.top - (event.clientY - drag.y);
  }, { signal });
  const release = event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    delete dialog.dataset.panning; drag = null;
    if (event.type === 'pointerup' && scale <= 1 && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) move((dx < 0) !== rtl() ? 1 : -1);
  };
  stage.addEventListener('pointerup', release, { signal });
  stage.addEventListener('pointercancel', release, { signal });
  dialog.addEventListener('cx-lightbox:close', event => { if (event.target === dialog) { generation++; lightboxStop(media); stage.replaceChildren(); media = null; index = -1; } }, { signal });
  signal?.addEventListener('abort', () => dialog.remove(), { once: true });
  return {
    open, close: () => overlay.close('api'), next: () => move(1), back: () => move(-1), zoom,
    getState: () => ({ open: overlay.opened, index, total: overlay.opened ? list.length : items().length, zoom: scale })
  };
};
