  // ---------- flow: task lists (mode "tasks", docs/flow.md#task-lists) ----------
  // The flow opens on a hub: its visible steps as task rows (grouped by their group), each a full-width button with its state
  // in words and an icon, the host's one-line summary and its blockers, under an "X of Y complete" line. A task opens as a
  // step and Save and return brings the reader back. The host can set states through hooks.status(values, { signal }) or
  // setStepState(stepId, { state, summary, blockers }): complete, needsAction, blocked or notStarted. Review and submit opens
  // once every required task (not optional) is complete and none needs action or is blocked.
  const FLOW_TASK_STATES = ["complete", "needsAction", "blocked", "notStarted"];
  const FLOW_TASK_MARKS = { complete: "✓", error: "!", needsAction: "!", blocked: "—", notStarted: "" };

  Object.assign(FlowView.prototype, {
    tasks() { return this.visibleSteps().filter(step => step.type !== "review"); },
    counted(step) { return step.asks && !step.optional; },

    /** A task's state: blocked by the host, failing checks, needing action, complete, or not started. */
    taskState(step) {
      const host = this.stepStatus.get(step.id);
      if (host?.state === "blocked") return "blocked";
      if (this.stepErrorCount(step)) return "error";
      if (host?.state === "needsAction") return "needsAction";
      if (host?.state === "complete" || this.completed.has(step.id)) return "complete";
      return "notStarted";
    },
    taskOpens(step) { return step.type === "review" ? this.tasksReady() : this.taskState(step) !== "blocked"; },
    tasksReady() { return this.tasks().filter(step => this.counted(step)).every(step => this.taskState(step) === "complete"); },
    hubAnnouncement() {
      const counted = this.tasks().filter(step => this.counted(step));
      return fill(this.labels.flowTasksProgress, { done: counted.filter(step => this.taskState(step) === "complete").length, count: counted.length });
    },

    hubSection() {
      const section = h("section", "cx-flow-step cx-flow-hub"), heading = h("h3", "cx-flow-step-title"), progress = h("p", "cx-flow-hub-progress");
      heading.id = this.id + "-hub"; heading.tabIndex = -1; setText(heading, this.labels.flowTasks);
      section.setAttribute("aria-labelledby", heading.id);
      progress.id = this.id + "-hub-progress";
      const lists = h("div", "cx-flow-task-groups");
      section.append(heading, progress, lists);
      if (this.banner && !this.reviewStep()) section.appendChild(this.answerBanner());
      this.hubNode = section;
      this.paintHub();
      this.loadStatus();
      return section;
    },

    /** Draws the task rows from the current states; called again when an answer, a check or the host's status changes. */
    paintHub() {
      const section = this.hubNode;
      if (!section) return;
      const labels = this.labels, lists = section.querySelector(".cx-flow-task-groups"), groups = new Map();
      for (const step of this.tasks()) { const name = step.group || ""; if (!groups.has(name)) groups.set(name, []); groups.get(name).push(step); }
      const focused = document.activeElement?.closest?.("[data-cx-task]")?.dataset.cxTask;
      lists.replaceChildren(...[...groups].map(([name, steps]) => {
        const group = h("section", "cx-flow-task-group"), list = h("ol", "cx-flow-task-list");
        if (name) { const title = h("h4", "cx-flow-section-title"); title.id = this.id + "-tg-" + steps[0].id; setText(title, name); group.setAttribute("aria-labelledby", title.id); group.appendChild(title); }
        for (const step of steps) list.appendChild(this.taskRow(step));
        group.appendChild(list);
        return group;
      }));
      setText(section.querySelector(".cx-flow-hub-progress"), this.hubAnnouncement());
      if (focused) lists.querySelector('[data-cx-task="' + CSS.escape(focused) + '"] button')?.focus({ preventScroll: true });
      if (this.step === this.hub) this.renderActions();
    },

    taskRow(step) {
      const labels = this.labels, state = this.taskState(step), host = this.stepStatus.get(step.id);
      const row = h("li", "cx-flow-task"), open = h("button", "cx-flow-task-open"), title = h("span", "cx-flow-task-title"), status = h("span", "cx-flow-task-state"), mark = h("span", "cx-flow-task-mark");
      row.dataset.cxTask = step.id; row.dataset.cxState = state;
      open.type = "button"; setText(title, step.title);
      const words = state === "complete" ? labels.flowStepComplete : state === "error" ? fill(labels.flowStepErrors, { count: this.stepErrorCount(step) }) :
        state === "needsAction" ? labels.flowTaskNeedsAction : state === "blocked" ? labels.flowTaskBlocked : step.optional ? labels.flowStepOptional : labels.flowStepNotStarted;
      mark.setAttribute("aria-hidden", "true"); setText(mark, FLOW_TASK_MARKS[state] || "");
      status.append(mark, words);
      status.id = this.id + "-ts-" + step.id;
      open.appendChild(title);
      const notes = [status.id];
      if (host?.summary) { const summary = h("span", "cx-flow-task-summary"); summary.id = this.id + "-tsum-" + step.id; setText(summary, host.summary); open.appendChild(summary); notes.push(summary.id); }
      open.setAttribute("aria-describedby", notes.join(" "));
      if (state === "blocked") open.setAttribute("aria-disabled", "true");
      open.addEventListener("click", () => { if (open.getAttribute("aria-disabled") !== "true") this.goTo(step.id).catch(error => this.report(error, "goTo")); });
      row.append(open, status);
      if (host?.blockers?.length) {
        const blockers = h("ul", "cx-flow-task-blockers");
        for (const text of host.blockers) { const item = h("li"); setText(item, text); blockers.appendChild(item); }
        row.appendChild(blockers);
      }
      return row;
    },

    /** The hub's action: Review and submit (or Submit without a review page), open once the required tasks are complete. */
    hubActions() {
      const labels = this.labels, review = this.reviewStep(), ready = this.tasksReady(), go = h("button", "cx-flow-btn cx-primary cx-flow-next"), note = h("span", "cx-flow-hub-note");
      go.type = "button"; setText(go, review ? labels.flowTasksReview : this.model.submitLabel || labels.flowSubmit);
      note.id = this.id + "-hub-note"; setText(note, ready ? "" : labels.flowTasksIncomplete); note.hidden = ready;
      if (!ready) { go.setAttribute("aria-disabled", "true"); go.setAttribute("aria-describedby", note.id); }
      go.addEventListener("click", () => {
        if (!this.tasksReady()) { this.announce(labels.flowTasksIncomplete); return; }
        (review ? this.goTo(review.id) : this.submit()).catch(error => this.report(error, review ? "goTo" : "submit"));
      });
      if (this.busy) { go.disabled = true; go.setAttribute("aria-busy", "true"); }
      this.actions.append(...this.quietActions(), note, h("span", "cx-flow-spacer"), go);
    },

    /** Asks the host for the tasks' states (hooks.status); a later answer replaces an earlier one. */
    loadStatus() {
      if (typeof this.hooks.status !== "function") return;
      this.statusController?.abort();
      const controller = this.statusController = new AbortController();
      this.timed("status", signal => this.hooks.status(this.getValues(), { signal }), controller).then(answer => {
        if (this.statusController !== controller || this.destroyed || answer.cancelled || answer.failed) return;
        if (!flowIs(answer.value)) { this.report(new Error("CanopyX: the status hook answers an object of step states."), "status"); return; }
        for (const [id, state] of Object.entries(answer.value)) if (this.model.steps.some(step => step.id === id)) this.applyStepState(id, state);
        this.paintHub();
      });
    },

    /** Sets a task's state as the host sees it (api.setStepState); null returns it to what the answers say. */
    setStepState(id, state) {
      if (!this.model.steps.some(step => step.id === id)) flowFail("there is no step '" + id + "'");
      this.applyStepState(id, state);
      if (this.step === this.hub) this.paintHub(); else this.renderRail();
    },
    applyStepState(id, state) {
      if (state === null) { this.stepStatus.delete(id); return; }
      const text = value => typeof value === "string" && /\S/.test(value) ? value.slice(0, 400) : null;
      if (!flowIs(state) || !FLOW_TASK_STATES.includes(state.state) || state.blockers !== undefined && !Array.isArray(state.blockers)) flowFail("a step state is { state: complete | needsAction | blocked | notStarted, summary, blockers }");
      this.stepStatus.set(id, { state: state.state, summary: text(state.summary), blockers: (state.blockers || []).map(text).filter(Boolean).slice(0, 10) });
    }
  });
