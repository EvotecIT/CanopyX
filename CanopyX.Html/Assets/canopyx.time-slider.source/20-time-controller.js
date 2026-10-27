  function timeCreate(host, source, hostLabels, kind, validate, update) {
    const model = timeModel(source, kind, validate), labels = timeLabels(source.labels, hostLabels);
    const lifetime = new AbortController(), signal = lifetime.signal, media = matchMedia("(prefers-reduced-motion: reduce)");
    const elements = timeControlsTemplate(model, labels, source, hostLabels, host.closest("[lang]")?.getAttribute("lang"));
    const { root, range, previous, play, next } = elements;
    const hadFrame = host.classList.contains("cx-time-host");
    host.classList.add("cx-time-host");
    let index = model.initial, playing = false, timer = null, disposed = false;
    const state = () => Object.freeze({ index, count: model.snapshots.length, at: model.snapshots[index].at, playing, reducedMotion: media.matches });
    const paint = () => timeStateTemplate(elements, model, labels, index, playing, media.matches);
    const pause = () => { playing = false; clearTimeout(timer); timer = null; if (!disposed) paint(); return state(); };
    const seek = target => {
      if (disposed) throw new DOMException("Snapshot playback was destroyed.", "AbortError");
      if (!Number.isInteger(target) || target < 0 || target >= model.snapshots.length) throw new RangeError("Snapshot index is outside the supplied history.");
      pause(); update(model.snapshots[target].view); index = target; paint(); return state();
    };
    const tick = () => {
      timer = setTimeout(() => {
        if (disposed || !playing || media.matches) return;
        try { update(model.snapshots[index + 1].view); ++index; }
        catch (error) { pause(); host.dispatchEvent(new CustomEvent("canopyx:error", { detail: { error }, bubbles: true })); return; }
        if (index === model.snapshots.length - 1) pause(); else { paint(); tick(); }
      }, model.interval);
    };
    const start = () => { if (!disposed && !playing && !media.matches && index < model.snapshots.length - 1) { playing = true; paint(); tick(); } return state(); };
    previous.addEventListener("click", () => seek(index - 1), { signal }); next.addEventListener("click", () => seek(index + 1), { signal });
    play.addEventListener("click", () => playing ? pause() : start(), { signal });
    range.addEventListener("input", () => seek(Number(range.value)), { signal });
    media.addEventListener("change", pause, { signal }); window.addEventListener("beforeprint", pause, { signal });
    try { update(model.snapshots[index].view); paint(); host.prepend(root); }
    catch (error) { lifetime.abort(); root.remove(); if (!hadFrame) host.classList.remove("cx-time-host"); throw error; }
    return { play: start, pause, seek, step: (delta = 1) => {
      if (!Number.isInteger(delta)) throw new RangeError("Snapshot step must be an integer.");
      return seek(Math.max(0, Math.min(model.snapshots.length - 1, index + delta)));
    }, getState: state, destroy: () => { if (disposed) return; pause(); disposed = true; lifetime.abort(); root.remove(); if (!hadFrame) host.classList.remove("cx-time-host"); } };
  }
  TIME_SLIDER_IMPL.create = timeCreate;
