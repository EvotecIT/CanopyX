  // Templates return named controls; event and record ownership stays outside.
  function stackRecordTemplate(text) {
    const button = h("button", "cx-btn cx-stack-title"); button.type = "button"; setText(button, text);
    return button;
  }
  function stackBadgesTemplate(layer, labels) {
      const badges = h("div", "cx-stack-badges");
      if (layer.winner) badges.appendChild(badgeElement({ text: labels.stackWinner, tone: "success" }));
      if (layer.enforced) badges.appendChild(badgeElement({ text: labels.stackEnforced, tone: "info" }));
      if (layer.filtered) badges.appendChild(badgeElement({ text: labels.stackFiltered, tone: "neutral" }));
      for (const badge of layer.badges || []) badges.appendChild(badgeElement(badge));
      badges.hidden = !badges.childElementCount;
      return badges;
    }
  function stackFrameTemplate(stack, frame, layers, recordButton, attachLayer) {
    const stackBadges = layer => stackBadgesTemplate(layer, stack.labels);
      const viewTitle = h("h2", "cx-stack-title-heading"); setText(viewTitle, this.view.label); frame.appendChild(viewTitle);
      if (!layers.length) { const empty = h("p", "cx-stack-empty"); setText(empty, stack.labels.stackEmpty); frame.appendChild(empty); return null; }
      const winner = layers.find(layer => layer.winner), summary = h("header", "cx-stack-winner"), summaryLabel = h("h3"), summaryTitle = recordButton(winner);
      applyTone(summary, "cx-stack-winner", toneOf("success"));
      setText(summaryLabel, stack.labels.stackWinner); summary.append(summaryLabel, summaryTitle);
      if (winner.label) { const label = h("p", "cx-stack-context"); setText(label, winner.label); summary.appendChild(label); }
      const summaryReason = h("p", "cx-stack-reason"); setText(summaryReason, winner.reason); summary.append(summaryReason, stackBadges(winner)); frame.appendChild(summary);
      const heading = h("h3", "cx-stack-order"), list = h("ol", "cx-stack-layers"); heading.id = this.id + "-stack-order";
      setText(heading, stack.labels.stackOrder); list.setAttribute("aria-labelledby", heading.id); list.setAttribute("role", "list"); frame.append(heading, list);
      layers.forEach((layer, index) => {
        const item = h("li", "cx-stack-layer"), number = h("span", "cx-stack-number"), body = h("div", "cx-stack-body");
        item.dataset.cxStackLayer = layer.id; item.dataset.cxStackRecord = layer.record;
        item.classList.toggle("cx-stack-filtered", !!layer.filtered); item.classList.toggle("cx-stack-selected", !!layer.winner);
        number.setAttribute("aria-hidden", "true"); setText(number, String(index + 1));
        const title = recordButton(layer), reason = h("p", "cx-stack-reason"); reason.id = this.id + "-stack-reason-" + index;
        title.setAttribute("aria-describedby", reason.id); setText(reason, layer.reason); body.appendChild(title);
        if (layer.label) { const label = h("p", "cx-stack-context"); setText(label, layer.label); body.appendChild(label); }
        body.append(reason, stackBadges(layer)); item.append(number, body); list.appendChild(item);
        attachLayer(title, list, index);
      });
      return list;
  }
