// Video items: a native <video> with controls, an optional poster and autoplay (muted, as browsers require for autoplay), and
// YouTube items embedded from youtube-nocookie.com. A YouTube item needs the network; everything else works offline.
/** The video id of a YouTube address (watch, youtu.be, embed or shorts) or of a bare id; null when it is none. */
function lightboxYouTubeId(src) {
  const text = String(src || '').trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  try {
    const url = new URL(text, document.baseURI), host = url.hostname.replace(/^(www|m)\./, '');
    const id = host === 'youtu.be' ? url.pathname.slice(1) : /^(youtube\.com|youtube-nocookie\.com)$/.test(host)
      ? url.searchParams.get('v') || (url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/) || [])[1] : null;
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}
/** The element a video or YouTube item plays in. */
function lightboxVideo(item, title) {
  if (item.type === 'youtube') {
    const frame = h('iframe', 'cx-lightbox-frame'), id = lightboxYouTubeId(item.src);
    frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0' + (item.autoplay ? '&autoplay=1&mute=1' : '');
    frame.title = title; frame.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen'); frame.setAttribute('allowfullscreen', '');
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    return frame;
  }
  const video = h('video', 'cx-lightbox-video');
  video.controls = true; video.playsInline = true; video.preload = 'metadata'; video.setAttribute('aria-label', title);
  if (item.poster) video.poster = item.poster;
  if (item.autoplay) { video.muted = true; video.autoplay = true; }
  video.src = item.src;
  return video;
}
/** Stops a video the viewer leaves: a removed <video> element can keep playing its sound until it is unloaded. */
function lightboxStop(media) {
  if (media?.localName !== 'video') return;
  media.pause(); media.removeAttribute('src'); media.load();
}
