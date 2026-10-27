  // DOM construction only. Controllers supply records and attach events.
  function pathFrameTemplate(settings, labels, appendHop) {
      const title = h("h2", "cx-path-title-heading"); setText(title, this.view.label); this.pathFrame.appendChild(title);
      const help = h("p", "cx-path-help"); help.id = this.id + "-path-help"; setText(help, labels.pathKeys); this.pathFrame.appendChild(help);
      if (!settings.chains.length) { const empty = h("p", "cx-path-empty"); setText(empty, labels.pathEmpty); this.pathFrame.appendChild(empty); }
      for (const [chainIndex, chain] of settings.chains.entries()) {
        const section = h("section", "cx-path-chain"), heading = h("h3", "cx-path-heading"), hops = h("ol", "cx-path-hops");
        hops.setAttribute("role", "list");
        heading.id = this.id + "-path-chain-" + chainIndex; setText(heading, chain.label);
        section.dataset.cxPathChain = chain.id; section.setAttribute("aria-labelledby", heading.id);
        section.append(heading, hops); this.pathFrame.appendChild(section);
        for (const [index, hop] of chain.hops.entries()) {
          const item = appendHop(hop, index, chainIndex, chain.hops.length); hops.appendChild(item);
          if ((hop.flags || []).includes("cycle")) {
            const target = chain.hops.findIndex((previous, at) => at < index && previous.record === hop.record), step = target < 0 ? 0 : target;
            const link = h("a", "cx-path-return"), icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            link.href = "#" + this.id + "-path-" + chainIndex + "-" + step + "-title";
            icon.setAttribute("viewBox", "0 0 24 24"); icon.setAttribute("aria-hidden", "true");
            const route = document.createElementNS(icon.namespaceURI, "path"); route.setAttribute("d", "M20 3V13Q20 20 13 20H4M9 15L4 20L9 24"); icon.appendChild(route);
            link.append(icon, document.createTextNode(labels.pathCycle + ": " + labels.pathSource + " · " + fill(labels.pathStep, { number: step + 1, total: chain.hops.length })));
            link.addEventListener("click", event => { event.preventDefault(); document.getElementById(link.hash.slice(1))?.focus(); });
            item.appendChild(link);
          }
        }
      }
  }
  function pathHopTemplate(hop, row, labels, text, badges, index, chainIndex, total) {
      const item = h("li", "cx-path-hop"), step = h("div", "cx-path-step"), title = h("button", "cx-btn cx-path-title"), notes = h("div", "cx-path-notes");
      const prefix = this.id + "-path-" + chainIndex + "-" + index, ordinal = h("span");
      step.id = prefix + "-step"; notes.id = prefix + "-notes";
      setText(ordinal, fill(labels.pathStep, { number: index + 1, total })); step.appendChild(ordinal);
      for (const label of [index === 0 ? labels.pathSource : null, index === total - 1 ? labels.pathTarget : null].filter(Boolean)) {
        const marker = h("span", "cx-path-endpoint"); setText(marker, label); step.appendChild(marker);
      }
      title.id = prefix + "-title"; item.classList.toggle("cx-path-disabled", (hop.flags || []).includes("disabled"));
      title.type = "button"; setText(title, text); title.dataset.cxPathRecord = row.id; title.dataset.cxPathPosition = chainIndex + ":" + index;
      title.setAttribute("aria-describedby", step.id + " " + notes.id);
      item.append(step, title, notes);
      if (hop.label) { const label = h("p", "cx-path-label"); setText(label, hop.label); notes.appendChild(label); }
      const tokens = h("div", "cx-path-tokens");
      for (const flag of hop.flags || []) {
        const token = badgeElement({ text: labels["path" + flag[0].toUpperCase() + flag.slice(1)], tone: PATH_FLAGS[flag] });
        token.dataset.cxPathFlag = flag; tokens.appendChild(token);
      }
      for (const badge of badges) tokens.appendChild(badgeElement(badge));
      if (tokens.childNodes.length) notes.appendChild(tokens);
      return { item, title };
  }
