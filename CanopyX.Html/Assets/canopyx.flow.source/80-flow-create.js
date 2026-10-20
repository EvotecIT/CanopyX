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
      runCheck: id => view.runCheck(id), refreshOptions: id => view.refreshOptions(id), setStepState: (id, state) => view.setStepState(id, state),
      saveDraft: () => view.saveDraft(true), setPreset: id => Promise.resolve().then(() => view.applyPreset(id ?? null)),
      open: () => view.open(), close: () => view.close(),
      destroy: () => view.destroy()
    };
    return impl;
  }
