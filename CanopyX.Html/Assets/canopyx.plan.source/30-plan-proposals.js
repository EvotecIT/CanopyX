  Object.assign(DataGrid.prototype, {
    planStart() {
      if (this.planStarted) return;
      this.planStarted = true;
      if (!this.view.plan.proposeMoves) return;
      const signal = this.lifetime.signal, body = this.calBody;
      body.addEventListener("pointerdown", event => {
        const button = event.target.closest(".cx-plan-task"), task = button?._calEvent;
        if (event.button !== 0 || !task || task.base?.external) return;
        // Capture before the calendar's edit handlers; plan gestures never enter calApply or a writer.
        event.stopImmediatePropagation();
        if (this.planSending) return;
        this.planDrag = { pointer: event.pointerId, task, x: event.clientX, y: event.clientY, version: this.calVersion };
        body.setPointerCapture(event.pointerId);
      }, { capture: true, signal });
      body.addEventListener("pointermove", event => {
        const drag = this.planDrag;
        if (!drag || drag.pointer !== event.pointerId) return;
        event.stopImmediatePropagation();
        if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
        drag.moved = true; event.preventDefault();
        const axis = this.tlAxis, rect = this.tlCanvas.getBoundingClientRect(), x = this.calRtl ? rect.right - event.clientX : event.clientX - rect.left;
        const originX = this.calRtl ? rect.right - drag.x : drag.x - rect.left;
        let delta = axis.time(x) - axis.time(originX);
        if (axis.zoom === "hour") {
          const step = (this.cal.slotMinutes || 30) * 60000; delta = Math.round(delta / step) * step;
        } else {
          const days = this.calZone.day(axis.time(x)) - this.calZone.day(axis.time(originX));
          delta = this.calZone.instant(this.calZone.day(drag.task.start) + days, this.calZone.parts(drag.task.start).minutes) - drag.task.start;
        }
        const lane = document.elementFromPoint(event.clientX, event.clientY)?.closest(".cx-tl-lane[data-cx-resource]");
        const proposal = { start: drag.task.start + delta, end: (planMilestone(this, drag.task) ? drag.task.start : drag.task.end) + delta, resource: lane?.dataset.cxResource ?? drag.task.resource };
        this.planPreview = { task: drag.task, proposal, conflicts: this.planProblems(drag.task, proposal) };
        this.planPaintProposal();
      }, { capture: true, signal });
      const finish = (event, canceled) => {
        const drag = this.planDrag;
        if (!drag || drag.pointer !== event.pointerId) return;
        event.stopImmediatePropagation(); this.planDrag = null;
        if (body.hasPointerCapture(event.pointerId)) body.releasePointerCapture(event.pointerId);
        const preview = this.planPreview;
        if (drag.moved) { this.planSuppressClick = true; queueMicrotask(() => { setTimeout(() => { this.planSuppressClick = false; }, 0); }); }
        if (canceled || drag.version !== this.calVersion || !drag.moved) { this.planClearProposal(); return; }
        if (preview) void this.planSendProposal(drag.task, preview.proposal);
      };
      body.addEventListener("pointerup", event => finish(event, false), { capture: true, signal });
      body.addEventListener("pointercancel", event => finish(event, true), { capture: true, signal });
      body.addEventListener("lostpointercapture", event => { if (this.planDrag?.pointer === event.pointerId) { this.planDrag = null; this.planClearProposal(); } }, { signal });
      body.addEventListener("click", event => { if (this.planSuppressClick) { event.preventDefault(); event.stopImmediatePropagation(); this.planSuppressClick = false; } }, { capture: true, signal });
      body.addEventListener("keydown", event => {
        if (event.key === "Escape" && (this.planPreview || this.planDrag)) { event.stopImmediatePropagation(); this.planDrag = null; this.planClearProposal(); return; }
        const task = event.target.closest(".cx-plan-task")?._calEvent;
        if (!task || !event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault(); event.stopImmediatePropagation();
        const horizontal = ["ArrowLeft", "ArrowRight"].includes(event.key), sign = (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) * (horizontal && this.calRtl ? -1 : 1);
        const delta = horizontal ? this.calZoom === "hour" ? sign * (this.cal.slotMinutes || 30) * 60000 :
          this.calZone.instant(this.calZone.day(task.start) + sign, this.calZone.parts(task.start).minutes) - task.start : 0;
        void this.planSendProposal(task, { start: task.start + delta, end: task.end + delta, resource: horizontal ? task.resource : this.calResourceStep(task.resource, sign) });
      }, { capture: true, signal });
      const reset = () => { this.planDrag = null; this.planClearProposal(); };
      for (const name of ["query", "rowsChanged", "commit", "cellValueChanged"]) this.host.addEventListener("canopyx:" + name, reset, { signal });
      signal.addEventListener("abort", () => { this.planDrag = null; this.planClearProposal(); }, { once: true });
    },
    planClearProposal() {
      this.planPreview = null; this.planGhost?.remove(); this.planGhost = null;
      for (const item of this.tlCanvas?.querySelectorAll(".cx-plan-proposal-conflict") || []) item.classList.remove("cx-plan-proposal-conflict");
    },
    planPaintProposal() {
      this.planGhost?.remove(); this.planGhost = null;
      for (const item of this.tlCanvas?.querySelectorAll(".cx-plan-proposal-conflict") || []) item.classList.remove("cx-plan-proposal-conflict");
      const preview = this.planPreview;
      if (!preview) return;
      const { task, proposal, conflicts } = preview, lane = this.tlLanes.get(proposal.resource);
      const ids = new Set(conflicts.map(problem => problem.id).filter(Boolean));
      for (const element of this.tlCanvas.querySelectorAll(".cx-plan-task")) element.classList.toggle("cx-plan-proposal-conflict", ids.has(element.dataset.cxRecord));
      if (!lane) return;
      const ghost = this.planGhost = h("div", "cx-plan-proposal" + (conflicts.length ? " cx-plan-proposal-invalid" : ""));
      ghost.style.insetInlineStart = this.tlAxis.x(proposal.start) + "px"; ghost.style.width = Math.max(8, this.tlAxis.x(proposal.end) - this.tlAxis.x(proposal.start)) + "px";
      ghost.textContent = task.title; ghost.title = conflicts.map(item => item.label).join("; ") || this.planText("planPending");
      ghost.setAttribute("aria-hidden", "true"); lane.appendChild(ghost);
    },
    async planSendProposal(task, proposal) {
      if (this.destroyed || this.planSending || !this.view.plan.proposeMoves) return false;
      if (planMilestone(this, task)) proposal = { ...proposal, end: proposal.start };
      const conflicts = this.planProblems(task, proposal), version = this.calVersion;
      const detail = gridFreeze({ id: task.key, previous: { start: new Date(task.start).toISOString(), end: new Date(task.end).toISOString(), resource: task.resource },
        proposed: { start: new Date(proposal.start).toISOString(), end: new Date(proposal.end).toISOString(), resource: proposal.resource }, conflicts: JSON.parse(JSON.stringify(conflicts)) });
      this.planPreview = { task, proposal, conflicts }; this.planPaintProposal();
      const message = this.planText("planProposal", { task: task.title, start: detail.proposed.start, end: detail.proposed.end });
      this.calAnnounce(message + (conflicts.length ? ". " + conflicts.map(item => item.label).join("; ") : ". " + this.planText("planPending")));
      // Neither dispatch nor callback return values accept a proposal or mutate records. Only a host refresh changes actuals.
      if (!this.emit("planChangeProposal", detail)) { this.planClearProposal(); return false; }
      const handler = this.opts.plan?.propose;
      if (typeof handler !== "function") { this.planClearProposal(); return false; }
      this.planSending = true;
      try { await this.runGridHook(signal => handler(detail, { signal }), this.dataLifetime.signal); return !this.destroyed && this.calVersion === version; }
      catch (error) { if (!this.destroyed) this.emit("error", { error }); return false; }
      finally { this.planSending = false; this.planClearProposal(); }
    }
  });
