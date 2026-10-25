  // Shared lifecycle shell; ordinary matrix and propagation views do not load the playback part.
  class TimeSliderHost {}
  const TIME_SLIDER_IMPL = {};
  const TIME_SLIDER_PART = definePart(TimeSliderHost, "time-slider", "snapshot playback", () => ({ TIME_SLIDER_IMPL, h, setText, fill, PROTOCOL }));
  function bindTimeSlider(api, options, kind, validate, reportError) {
    const ownerReady = api.ready, update = api.update, destroy = api.destroy;
    let controller = null, revision = 0, disposed = false;
    const cancelled = () => new DOMException("Snapshot playback was replaced or destroyed.", "AbortError");
    const install = async (view, token) => {
      await ownerReady;
      if (disposed || token !== revision) throw cancelled();
      if (!Object.hasOwn(view, "timeSlider")) return;
      try {
        await loadPart(TIME_SLIDER_PART);
        if (disposed || token !== revision) throw cancelled();
        validate(view);
        controller = TIME_SLIDER_IMPL.create(api.element, view, options.labels, kind, validate, update);
      } catch (error) {
        if (disposed || token !== revision) throw cancelled();
        if (error?.name !== "AbortError") reportError(error);
        throw error;
      }
    };
    api.ready = ownerReady.then(async () => { if (!revision && !disposed) await install(options.view, 0); return api; });
    api.ready.catch(() => {});
    api.update = view => {
      const token = ++revision;
      controller?.destroy(); controller = null;
      if (disposed) throw cancelled();
      // Keep the ordinary view's synchronous update contract when no history is supplied.
      if (!view || !Object.hasOwn(view, "timeSlider")) return update(view);
      return install(view, token);
    };
    const call = name => (...args) => {
      if (disposed) throw cancelled();
      if (!controller) throw new Error("CanopyX: snapshot playback is not ready or this view has no time slider.");
      return controller[name](...args);
    };
    api.playback = Object.freeze(Object.fromEntries(["play", "pause", "step", "seek", "getState"].map(name => [name, call(name)])));
    api.destroy = () => { if (disposed) return; disposed = true; ++revision; controller?.destroy(); controller = null; destroy(); };
  }
