  // ---------- the flow-dialog part: dialog and drawer flows (layout.container, docs/flow.md#dialogs-and-drawers) ----------
  // A short task opens from a launch button in the host as a modal <dialog>: centred (dialog) or along the inline end (drawer),
  // full screen on phones. The native dialog keeps focus inside; closing returns focus to the launch button. Escape, Cancel
  // and the close button ask before discarding changed answers: the host hears canopyx:flowLeaving first (cancelable), then
  // the flow asks in place, never with window.confirm.
  const FLOW_PART_LABELS = {
    flowClose: "Close",
    flowDiscardQuestion: "Discard your answers?",
    flowDiscard: "Discard",
    flowKeepEditing: "Keep editing"
  };
  Object.assign(FLOW_LABELS, FLOW_PART_LABELS);
  const flowRelease = FlowView.prototype.destroy;
  FLOW_HOST.dialog = {
    /** The container a flow opens in (inline, a dialog or a drawer) and the launch button's text. */
    document(doc, model) {
      const raw = doc.layout;
      if (!raw) return;
      model.container = raw.container ?? "inline";
      if (!["inline", "dialog", "drawer"].includes(model.container)) flowFail("the flow layout has an unknown container");
      if (raw.launch !== undefined && model.container === "inline") flowFail("only a dialog or drawer flow has a launch button");
      model.launch = flowString(raw.launch, 80, "The launch label");
    }
  };

  Object.assign(FlowView.prototype, {
    /** Destroying a dialog or drawer flow removes its launch button and dialog too. */
    destroy() { flowRelease.call(this); this.shell?.remove(); },
    buildContainer() {
      const labels = this.labels, shell = this.shell = h("div", "cx-flow-launcher"), launch = this.launcher = h("button", "cx-flow-btn cx-primary cx-flow-launch");
      launch.type = "button"; setText(launch, this.model.launch || this.model.title);
      launch.setAttribute("aria-haspopup", "dialog");
      const dialog = this.dialog = h("dialog", "cx-flow-dialog" + (this.model.container === "drawer" ? " cx-flow-drawer" : ""));
      dialog.setAttribute("aria-labelledby", this.id + "-title");
      const close = h("button", "cx-flow-icon-btn cx-flow-close");
      close.type = "button"; setText(close, "×"); close.setAttribute("aria-label", labels.flowClose);
      this.head.classList.add("cx-flow-head-close"); this.head.appendChild(close);
      const confirm = this.discardBar = h("div", "cx-flow-discard"), question = h("p"), discard = h("button", "cx-flow-btn"), keep = h("button", "cx-flow-btn cx-primary");
      confirm.setAttribute("role", "alertdialog"); confirm.setAttribute("aria-labelledby", this.id + "-discard"); confirm.hidden = true;
      question.id = this.id + "-discard"; setText(question, labels.flowDiscardQuestion);
      discard.type = keep.type = "button"; setText(discard, labels.flowDiscard); setText(keep, labels.flowKeepEditing);
      confirm.append(question, keep, discard);
      this.root.insertBefore(confirm, this.layout);
      dialog.appendChild(this.root);
      shell.append(launch, dialog);
      this.host.appendChild(shell);
      const signal = this.lifetime.signal;
      launch.addEventListener("click", () => this.open(), { signal });
      close.addEventListener("click", () => this.close(), { signal });
      dialog.addEventListener("cancel", event => { event.preventDefault(); this.close(); }, { signal });
      keep.addEventListener("click", () => { confirm.hidden = true; this.stage.querySelector(".cx-flow-step-title")?.focus(); }, { signal });
      discard.addEventListener("click", () => this.close(true), { signal });
    },

    /** Cancel, quiet beside Back, in a dialog or drawer. */
    cancelButton() {
      if (!this.dialog) return null;
      const cancel = h("button", "cx-flow-btn cx-flow-quiet"); cancel.type = "button"; setText(cancel, this.labels.flowCancel);
      cancel.addEventListener("click", () => this.close());
      return cancel;
    },

    /** Opens a dialog or drawer flow (api.open); false for an inline flow. */
    open() {
      if (!this.dialog || this.dialog.open) return !!this.dialog;
      this.discardBar.hidden = true;
      this.dialog.showModal();
      // The grid parts measure their host: a picker shown for the first time measures now that the dialog has a size.
      this.measure(); this.render();
      (this.stage.querySelector(".cx-flow-step-title") || this.root).focus({ preventScroll: true });
      return true;
    },

    /** Closes a dialog or drawer flow (api.close). Changed answers are kept only by an explicit choice: unless force, the host
     *  may veto through canopyx:flowLeaving and the reader is asked first. A closed flow that had saved starts afresh. */
    close(force) {
      if (!this.dialog?.open) return false;
      if (!force && this.phase === "form" && this.isDirty()) {
        if (!this.emit("flowLeaving", { reason: "close" }, "onLeaving", true)) return false;
        this.discardBar.hidden = false;
        this.discardBar.querySelector(".cx-primary").focus();
        return false;
      }
      this.discardBar.hidden = true;
      this.dialog.close();
      if (force || this.phase !== "form") { this.panel = null; this.reset(); }
      this.launcher.focus();
      return true;
    }
  });
