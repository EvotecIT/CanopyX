  Object.assign(DataGrid.prototype, {
    pathPaint() {
      const path = this.path, settings = path.settings, labels = path.labels;
      const active = document.activeElement, held = this.pathFrame.contains(active) ? active.dataset.cxPathPosition : null;
      this.pathFrame.replaceChildren();
      const title = h("h2", "cx-path-title-heading"); setText(title, this.view.label); this.pathFrame.appendChild(title);
      const help = h("p", "cx-path-help"); help.id = this.id + "-path-help"; setText(help, labels.pathKeys); this.pathFrame.appendChild(help);
      if (!settings.chains.length) { const empty = h("p", "cx-path-empty"); setText(empty, labels.pathEmpty); this.pathFrame.appendChild(empty); }
      for (const [chainIndex, chain] of settings.chains.entries()) {
        const section = h("section", "cx-path-chain"), heading = h("h3", "cx-path-heading"), hops = h("ol", "cx-path-hops");
        hops.setAttribute("role", "list");
        heading.id = this.id + "-path-chain-" + chainIndex; setText(heading, chain.label);
        section.dataset.cxPathChain = chain.id; section.setAttribute("aria-labelledby", heading.id);
        section.append(heading, hops); this.pathFrame.appendChild(section);
        for (const [index, hop] of chain.hops.entries()) hops.appendChild(this.pathHop(hop, index, chainIndex, chain.hops.length));
      }
      if (held) [...this.pathFrame.querySelectorAll("[data-cx-path-position]")].find(node => node.dataset.cxPathPosition === held)?.focus({ preventScroll: true });
    },
    pathHop(hop, index, chainIndex, total) {
      const path = this.path, labels = path.labels, row = path.settings.records.get(hop.record);
      const column = this.columns.find(column => column.id === path.settings.titleColumn), cell = row.cells[column.id];
      const item = h("li", "cx-path-hop"), step = h("div", "cx-path-step"), title = h("button", "cx-path-title"), notes = h("div", "cx-path-notes");
      const prefix = this.id + "-path-" + chainIndex + "-" + index, ordinal = h("span");
      step.id = prefix + "-step"; notes.id = prefix + "-notes";
      setText(ordinal, fill(labels.pathStep, { number: index + 1, total })); step.appendChild(ordinal);
      for (const label of [index === 0 ? labels.pathSource : null, index === total - 1 ? labels.pathTarget : null].filter(Boolean)) {
        const marker = h("span", "cx-path-endpoint"); setText(marker, label); step.appendChild(marker);
      }
      const text = cellText(cell, column, this.fmt) || row.id;
      title.type = "button"; setText(title, text); title.dataset.cxPathRecord = row.id; title.dataset.cxPathPosition = chainIndex + ":" + index;
      title.setAttribute("aria-describedby", step.id + " " + notes.id);
      title.addEventListener("click", () => this.openRecord(row.id, { returnFocus: title }).catch(error => this.emit("error", { error })));
      item.append(step, title, notes);
      if (hop.label) { const label = h("p", "cx-path-label"); setText(label, hop.label); notes.appendChild(label); }
      const tokens = h("div", "cx-path-tokens");
      for (const flag of hop.flags || []) {
        const token = badgeElement({ text: labels["path" + flag[0].toUpperCase() + flag.slice(1)], tone: PATH_FLAGS[flag] });
        token.dataset.cxPathFlag = flag; tokens.appendChild(token);
      }
      for (const badge of [...(cell && typeof cell === "object" ? cell.badges || [] : []), ...(hop.badges || [])]) tokens.appendChild(badgeElement(badge));
      if (tokens.childNodes.length) notes.appendChild(tokens);
      title.addEventListener("keydown", event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const buttons = [...item.parentElement.querySelectorAll(".cx-path-title")];
        const target = event.key === "Home" ? buttons[0] : event.key === "End" ? buttons.at(-1) :
          ["ArrowLeft", "ArrowUp"].includes(event.key) ? buttons[index - 1] : ["ArrowRight", "ArrowDown"].includes(event.key) ? buttons[index + 1] : null;
        if (target) { event.preventDefault(); target.focus(); }
      });
      return item;
    }
  });
