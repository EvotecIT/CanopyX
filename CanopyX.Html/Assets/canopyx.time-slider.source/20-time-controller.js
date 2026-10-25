  function timeCreate(host, source, hostLabels, kind, validate, update) {
    const model = timeModel(source, kind, validate), labels = timeLabels(source.labels, hostLabels);
    const lifetime = new AbortController(), signal = lifetime.signal, media = matchMedia("(prefers-reduced-motion: reduce)");
    const root = h("section", "cx-time"), controls = h("div", "cx-time-controls"), range = h("input", "cx-time-range");
    const stamp = h("div", "cx-time-stamp"), position = h("span", "cx-time-position"), reduced = h("p", "cx-time-reduced");
    let index = model.initial, playing = false, timer = null, disposed = false;
    const button = text => { const result = h("button", "cx-time-button"); result.type = "button"; setText(result, text); return result; };
    const previous = button(labels.timePrevious), play = button(labels.timePlay), next = button(labels.timeNext);
    range.type = "range"; range.min = "0"; range.max = String(model.snapshots.length - 1); range.step = "1";
    range.setAttribute("aria-label", labels.timePosition.replace("{index}", "").replace("{count}", String(model.snapshots.length)).trim());
    stamp.setAttribute("aria-live", "polite"); root.setAttribute("aria-label", labels.timeFrame.replace("{time}", "").trim());
    setText(reduced, labels.timeReducedMotion);
    controls.append(previous, play, next, range, position); root.append(controls, stamp, reduced);
    const state = () => Object.freeze({ index, count: model.snapshots.length, at: model.snapshots[index].at, playing, reducedMotion: media.matches });
    const paint = () => {
      const item = model.snapshots[index], text = fill(labels.timePosition, { index: index + 1, count: model.snapshots.length });
      range.value = String(index); range.setAttribute("aria-valuetext", text + ": " + item.at);
      setText(position, text); setText(stamp, (item.label ? item.label + " · " : "") + fill(labels.timeFrame, { time: new Date(item.at).toISOString() }));
      previous.disabled = index === 0; next.disabled = index === model.snapshots.length - 1;
      play.disabled = media.matches || model.snapshots.length < 2 || !playing && index === model.snapshots.length - 1;
      play.setAttribute("aria-pressed", String(playing)); setText(play, playing ? labels.timePause : labels.timePlay); reduced.hidden = !media.matches;
    };
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
    catch (error) { lifetime.abort(); root.remove(); throw error; }
    return { play: start, pause, seek, step: (delta = 1) => {
      if (!Number.isInteger(delta)) throw new RangeError("Snapshot step must be an integer.");
      return seek(Math.max(0, Math.min(model.snapshots.length - 1, index + delta)));
    }, getState: state, destroy: () => { if (disposed) return; pause(); disposed = true; lifetime.abort(); root.remove(); } };
  }
  TIME_SLIDER_IMPL.create = timeCreate;
