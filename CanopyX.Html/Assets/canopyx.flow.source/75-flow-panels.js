  // ---------- flow: the result and progress panels ----------
  // Saved: the host's message, result rows and links, and Start another. A row marked once (a key shown a single time) gets
  // Copy and "I have saved it" and leaves the page with the panel. Accepted: the host's message and a progress bar the host
  // moves with setProgress until complete(answer).
  Object.assign(FlowView.prototype, {
    panelShell(kind, title) {
      const panel = h("section", "cx-flow-step cx-flow-panel cx-flow-" + kind), heading = h("h3", "cx-flow-step-title"), mark = h("span", "cx-flow-panel-mark");
      heading.id = this.id + "-panel"; heading.tabIndex = -1;
      mark.setAttribute("aria-hidden", "true"); setText(mark, kind === "result" ? "✓" : "…");
      heading.append(mark, title);
      panel.setAttribute("aria-labelledby", heading.id);
      panel.appendChild(heading);
      return panel;
    },

    resultPanel(answer) {
      const labels = this.labels, panel = this.panelShell("result", labels.flowSaved);
      if (answer.message) { const text = h("p", "cx-flow-panel-text"); setText(text, answer.message); panel.appendChild(text); }
      if (answer.result.length) {
        const list = h("dl", "cx-flow-answers cx-flow-results");
        for (const row of answer.result) {
          const item = h("div", "cx-flow-answer"), term = h("dt"), value = h("dd", "cx-flow-answer-value"), output = h("output", "cx-flow-result-value");
          setText(term, row.label); setText(output, row.value); term.id = this.id + "-result-" + list.children.length;
          value.appendChild(output);
          if (row.once) {
            item.classList.add("cx-flow-once");
            const note = h("span", "cx-flow-was"), copy = h("button", "cx-flow-btn"), saved = h("label", "cx-flow-check"), box = h("input"), text = h("span");
            setText(note, labels.flowShownOnce);
            copy.type = "button"; setText(copy, labels.flowCopy); copy.setAttribute("aria-describedby", term.id);
            copy.addEventListener("click", () => {
              const done = () => { setText(copy, labels.flowCopied); this.announce(labels.flowCopied); };
              // Without the clipboard (a page over plain http) the value is selected, ready for Ctrl+C.
              const select = () => global.getSelection?.().selectAllChildren(output);
              if (!global.navigator?.clipboard) { select(); return; }
              global.navigator.clipboard.writeText(row.value).then(done, error => { select(); this.report(error, "copy"); });
            });
            box.type = "checkbox"; box.className = "cx-flow-saved-it"; setText(text, labels.flowSavedIt); saved.append(box, text);
            value.append(note, copy, saved);
          }
          item.append(term, value);
          list.appendChild(item);
        }
        panel.appendChild(list);
      }
      if (answer.links.length) {
        const links = h("ul", "cx-flow-links");
        for (const link of answer.links) { const item = h("li"), anchor = h("a", "cx-flow-link"); anchor.href = link.href; setText(anchor, link.label); item.appendChild(anchor); links.appendChild(item); }
        panel.appendChild(links);
      }
      const actions = h("div", "cx-flow-actions cx-flow-panel-actions"), again = h("button", "cx-flow-btn");
      again.type = "button"; setText(again, labels.flowStartAgain);
      // A value shown once must be acknowledged before the panel that holds it can go.
      const acknowledged = () => { again.disabled = [...panel.querySelectorAll(".cx-flow-saved-it")].some(box => !box.checked); };
      panel.addEventListener("change", acknowledged);
      acknowledged();
      // Starting again removes the panel and every value it showed once.
      again.addEventListener("click", () => { this.panel = null; this.reset(); this.stage.querySelector(".cx-flow-step-title")?.focus(); });
      actions.appendChild(again);
      panel.appendChild(actions);
      return panel;
    },

    progressPanel(answer) {
      const panel = this.panelShell("progress", this.labels.flowAccepted), text = h("p", "cx-flow-panel-text"), bar = h("progress", "cx-flow-bar");
      setText(text, answer.message || "");
      bar.setAttribute("aria-labelledby", panel.firstChild.id);
      panel.append(text, bar);
      return panel;
    }
  });
