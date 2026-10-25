  Object.assign(DataGrid.prototype, {
    stackTitle(layer) {
      const stack = this.stack, row = stack.settings.records.get(layer.record), column = this.columns.find(column => column.id === stack.settings.titleColumn);
      return cellText(row.cells[column.id], column, this.fmt) || row.id;
    },
    stackRecordButton(layer) {
      const button = h("button", "cx-stack-title"); button.type = "button"; setText(button, this.stackTitle(layer));
      button.addEventListener("click", () => this.openRecord(layer.record, { returnFocus: button }).catch(error => { this.setNotice(error.message, true); this.emit("error", { error }); }));
      return button;
    },
    stackBadges(layer) {
      const badges = h("div", "cx-stack-badges"), labels = this.stack.labels;
      if (layer.winner) badges.appendChild(badgeElement({ text: labels.stackWinner, tone: "success" }));
      if (layer.enforced) badges.appendChild(badgeElement({ text: labels.stackEnforced, tone: "info" }));
      if (layer.filtered) badges.appendChild(badgeElement({ text: labels.stackFiltered, tone: "neutral" }));
      for (const badge of layer.badges || []) badges.appendChild(badgeElement(badge));
      badges.hidden = !badges.childElementCount;
      return badges;
    },
    stackPaint() {
      const stack = this.stack, frame = this.stackFrame, layers = stack.settings.layers;
      const held = document.activeElement, focusLayer = frame.contains(held) ? held.closest("[data-cx-stack-layer]")?.dataset.cxStackLayer : null;
      frame.replaceChildren();
      const viewTitle = h("h2", "cx-stack-title-heading"); setText(viewTitle, this.view.label); frame.appendChild(viewTitle);
      if (!layers.length) { const empty = h("p", "cx-stack-empty"); setText(empty, stack.labels.stackEmpty); frame.appendChild(empty); return; }
      const winner = layers.find(layer => layer.winner), summary = h("header", "cx-stack-winner"), summaryLabel = h("h3"), summaryTitle = this.stackRecordButton(winner);
      applyTone(summary, "cx-stack-winner", toneOf("success"));
      setText(summaryLabel, stack.labels.stackWinner); summary.append(summaryLabel, summaryTitle);
      if (winner.label) { const label = h("p", "cx-stack-context"); setText(label, winner.label); summary.appendChild(label); }
      const summaryReason = h("p", "cx-stack-reason"); setText(summaryReason, winner.reason); summary.append(summaryReason, this.stackBadges(winner)); frame.appendChild(summary);
      const heading = h("h3", "cx-stack-order"), list = h("ol", "cx-stack-layers"); heading.id = this.id + "-stack-order";
      setText(heading, stack.labels.stackOrder); list.setAttribute("aria-labelledby", heading.id); list.setAttribute("role", "list"); frame.append(heading, list);
      layers.forEach((layer, index) => {
        const item = h("li", "cx-stack-layer"), number = h("span", "cx-stack-number"), body = h("div", "cx-stack-body");
        item.dataset.cxStackLayer = layer.id; item.dataset.cxStackRecord = layer.record;
        item.classList.toggle("cx-stack-filtered", !!layer.filtered); item.classList.toggle("cx-stack-selected", !!layer.winner);
        number.setAttribute("aria-hidden", "true"); setText(number, String(index + 1));
        const title = this.stackRecordButton(layer), reason = h("p", "cx-stack-reason"); reason.id = this.id + "-stack-reason-" + index;
        title.setAttribute("aria-describedby", reason.id); setText(reason, layer.reason); body.appendChild(title);
        if (layer.label) { const label = h("p", "cx-stack-context"); setText(label, layer.label); body.appendChild(label); }
        body.append(reason, this.stackBadges(layer)); item.append(number, body); list.appendChild(item);
        title.addEventListener("keydown", event => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          const next = event.key === "Home" ? 0 : event.key === "End" ? layers.length - 1 : event.key === "ArrowDown" ? Math.min(layers.length - 1, index + 1) : event.key === "ArrowUp" ? Math.max(0, index - 1) : null;
          if (next !== null) { event.preventDefault(); list.children[next].querySelector("button").focus(); }
        });
      });
      if (focusLayer) [...list.children].find(item => item.dataset.cxStackLayer === focusLayer)?.querySelector("button").focus({ preventScroll: true });
    }
  });
