  // ---------- flow: the implementation createFlow uses (50-flow-shell.js installs it as FLOW_IMPL.create) ----------
  // Reads the document, paints the first step and answers with the members the flow's API forwards to. A document or option
  // that is wrong throws here, so createFlow's ready rejects and the host shows the message.
  function flowCreate(host, options, editors) {
    const view = new FlowView(host, options, editors);
    const impl = {
      ready: Promise.resolve().then(() => { if (!view.destroyed) host.setAttribute("data-cx-ready", ""); view.emit("flowReady", { flow: view.model.id, step: view.step.id }, "onReady"); return impl; }),
      next: () => view.next(), back: () => view.back(), goTo: id => view.goTo(id), getStep: () => view.getStep(),
      getValues: () => view.getValues(), setValues: values => view.setValues(values), getState: () => view.getState(), setState: state => view.setState(state),
      isDirty: () => view.isDirty(), reset: () => view.reset(), validate: id => view.validate(id), setFieldError: (id, message) => view.setFieldError(id, message),
      submit: () => view.submit(), setProgress: progress => view.setProgress(progress), complete: answer => view.complete(answer),
      destroy: () => view.destroy()
    };
    // The members of the host-connected parts. A flow without the part has no check, host options, task or preset to name,
    // saves no draft and has no dialog to open.
    const part = (name, none) => (...args) => view[name] ? view[name](...args) : none ?? flowFail("this flow does not use " + name);
    return Object.assign(impl, { runCheck: part("runCheck"), invalidateChecks: part("invalidateChecks"), refreshOptions: part("refreshOptions"), setStepState: part("setStepState"), setPreset: part("setPreset"),
      saveDraft: () => part("saveDraft", false)(true), open: () => part("open", false)(), close: () => part("close", false)() });
  }
