// Options of a select: read from the native <select> (value, text, disabled, data-description, data-badge, data-tone, data-icon,
// data-avatar, data-flag, data-group from an optgroup), from options.options, or loaded from the host (options.load or a source
// URL). Text is matched without case or accents. Option pictures are text and images only: an icon name goes through the
// host's renderIcon, an avatar is an image address and a flag is a two-letter country code drawn as its emoji.
const SELECT_TONES = /^[a-z][a-z0-9-]{0,31}$/;
const selectFold = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
const selectFlag = code => /^[A-Za-z]{2}$/.test(code || '') ? String.fromCodePoint(...[...code.toUpperCase()].map(letter => 0x1F1E6 + letter.charCodeAt(0) - 65)) : '';
// Avatars come from the page or the host: web, relative and image data addresses only, never script.
const selectSafeImage = src => typeof src === 'string' && !/^(?:javascript|vbscript|data:(?!image\/))/i.test(src.replace(/[\u0000- \u007f]/g, ''));

/** One option, checked: { value, label, description, badge, tone, icon, avatar, flag, group, disabled }. */
function selectOption(raw) {
  if (raw == null || typeof raw !== 'object') raw = { value: raw, label: raw };
  const value = raw.value == null ? '' : String(raw.value);
  const option = { value, label: raw.label == null || raw.label === '' ? value : String(raw.label), disabled: !!raw.disabled };
  for (const key of ['description', 'badge', 'icon', 'group']) if (raw[key] != null && raw[key] !== '') option[key] = String(raw[key]);
  if (typeof raw.tone === 'string' && SELECT_TONES.test(raw.tone)) option.tone = raw.tone;
  if (selectSafeImage(raw.avatar)) option.avatar = raw.avatar;
  if (selectFlag(raw.flag)) option.flag = raw.flag.toUpperCase();
  return option;
}
const selectReadNative = select => [...select.options].map(selectNativeOption);
function selectNativeOption(item) {
  return selectOption({ value: item.value, label: item.label.trim(), disabled: item.matches(':disabled'), description: item.dataset.description,
    badge: item.dataset.badge, tone: item.dataset.tone, icon: item.dataset.icon, avatar: item.dataset.avatar, flag: item.dataset.flag,
    group: item.parentElement?.localName === 'optgroup' ? item.parentElement.label : undefined });
}

/** The picture before an option's label: an avatar, a flag or an icon the host renders. */
function selectPicture(option, renderIcon) {
  if (option.avatar) { const image = h('img', 'cx-select-avatar'); image.src = option.avatar; image.alt = ''; image.decoding = 'async'; image.loading = 'lazy'; return image; }
  if (option.flag) { const flag = h('span', 'cx-select-flag'); flag.setAttribute('aria-hidden', 'true'); setText(flag, selectFlag(option.flag)); return flag; }
  if (option.icon) {
    const icon = h('span', 'cx-select-icon'); icon.setAttribute('aria-hidden', 'true'); icon.dataset.icon = option.icon;
    const drawn = renderIcon?.(option.icon, option);
    if (drawn?.nodeType) icon.append(drawn); else if (drawn != null) setText(icon, drawn);
    return icon;
  }
  return null;
}
/** An option row in the list, or a chip's content: the picture, the label, then the badge and description. */
function selectContent(option, renderIcon, full) {
  const parts = [], picture = selectPicture(option, renderIcon), label = h('span', 'cx-select-label');
  if (picture) parts.push(picture);
  setText(label, option.label); parts.push(label);
  if (full && option.badge) { const badge = h('span', 'cx-select-badge'); badge.dataset.tone = option.tone || 'neutral'; setText(badge, option.badge); parts.push(badge); }
  if (full && option.description) { const description = h('span', 'cx-select-description'); setText(description, option.description); parts.push(description); }
  return parts;
}

/**
 * Loads options for a query from options.load(query, signal) or a source URL (`?q=` added; the answer is a JSON array, or
 * { options: [...] }). Each request cancels the one before it; a late answer or failure is ignored.
 */
function selectLoader(options, root) {
  const source = options.source ?? root.dataset.source ?? null;
  const load = typeof options.load === 'function' ? options.load : source ? async (query, signal) => {
    const url = new URL(source, document.baseURI);
    url.searchParams.set(options.queryParameter || root.dataset.queryParameter || 'q', query);
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
    const body = await response.json();
    return Array.isArray(body) ? body : body?.options ?? [];
  } : null;
  if (!load) return null;
  let current = null;
  return {
    cancel() { current?.abort(); current = null; },
    async fetch(query) {
      current?.abort();
      const controller = current = new AbortController();
      let items;
      try { items = await load(query, controller.signal); } catch (error) { if (!controller.signal.aborted) throw error; }
      if (controller.signal.aborted) throw new DOMException('Superseded', 'AbortError');
      current = null;
      if (!Array.isArray(items)) throw new Error('CanopyX: a select source answers a list of options.');
      return items.slice(0, 500).map(selectOption);
    }
  };
}
