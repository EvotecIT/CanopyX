  // ---------- changes: the propagation view ----------
  // The overall state and summary, a count of each state, then a row per replica: its state as a symbol and its text, when the change
  // was first seen there and how long after the change, when it last reported, and a lane that draws that delay against the time
  // since the change. Narrow hosts stack each replica's cells (a container query), so it reads at 390 pixels.
  const PROPAGATION_RANK = { fault: 3, propagating: 2, unknown: 1, converged: 0 };
  class PropagationView {
    constructor(host, options) {
      this.host = host; this.options = options; this.lifetime = new AbortController();
      this.doc = propagationDocument(options.view);
      this.labels = changeLabels(this.doc.labels, options.labels);
      this.lang = host.closest("[lang]")?.getAttribute("lang") || document.documentElement.lang || "en";
      this.format = numberFormat(this.lang);
      this.root = h("div", "cx-prop");
      host.appendChild(this.root);
      this.render();
    }
    emit(name, detail, callback) {
      const event = new CustomEvent("canopyx:" + name, { detail, bubbles: true });
      this.host.dispatchEvent(event);
      if (typeof this.options[callback] === "function") { try { this.options[callback](detail, event); } catch (error) { this.host.dispatchEvent(new CustomEvent("canopyx:error", { detail: { error, hook: callback }, bubbles: true })); } }
    }
    stateText(state) { return this.labels["change" + state[0].toUpperCase() + state.slice(1)]; }
    badge(state, className) {
      const badge = h("span"), [icon, tone] = PROPAGATION_LOOK[state];
      applyTone(badge, className + (state === "fault" || state === "propagating" ? " cx-prop-attn" : ""), toneOf(tone));
      const text = h("span"); setText(text, this.stateText(state));
      badge.append(changeIcon(icon), text);
      return badge;
    }
    render() {
      const doc = this.doc, labels = this.labels, witnesses = doc.witnesses;
      const seen = witnesses.map(witness => witness.firstSeen).filter(time => time !== null), reports = witnesses.flatMap(witness => [witness.firstSeen, witness.lastSeen]).filter(time => time !== null);
      const start = doc.start ?? (seen.length ? Math.min(...seen) : null), end = doc.asOf ?? (reports.length ? Math.max(...reports) : null), span = start !== null && end !== null ? Math.max(1, end - start) : 0;
      const overall = doc.state || witnesses.reduce((worst, witness) => PROPAGATION_RANK[witness.state] > PROPAGATION_RANK[worst] ? witness.state : worst, "converged");
      const converged = witnesses.filter(witness => witness.state === "converged").length;
      const head = h("div", "cx-prop-head"), summary = h("span", "cx-prop-summary"), counts = h("ul", "cx-prop-counts");
      setText(summary, doc.summary || fill(labels.changeProgress, { converged: this.format.format(converged), total: this.format.format(witnesses.length) }));
      head.append(this.badge(overall, "cx-prop-state"), summary);
      for (const state of PROPAGATION_STATES) {
        const count = witnesses.filter(witness => witness.state === state).length;
        if (!count) continue;
        const item = h("li", "cx-prop-count"), badge = this.badge(state, "cx-prop-key"), number = h("span", "cx-prop-number");
        setText(number, this.format.format(count)); item.append(badge, number); counts.appendChild(item);
      }
      counts.setAttribute("aria-label", labels.changeState);
      const table = h("table", "cx-prop-table"), thead = h("thead"), heads = h("tr");
      table.setAttribute("aria-label", doc.label);
      for (const text of [doc.title || labels.changeReplica, labels.changeState, labels.changeFirstSeen, labels.changeLastSeen, labels.changeTimeline]) { const th = h("th"); th.scope = "col"; setText(th, text); heads.appendChild(th); }
      thead.appendChild(heads); table.appendChild(thead);
      const groups = new Map();
      for (const witness of witnesses) { if (!groups.has(witness.group)) groups.set(witness.group, []); groups.get(witness.group).push(witness); }
      for (const [group, members] of groups) {
        const body = h("tbody");
        if (group !== null) {
          const tr = h("tr", "cx-prop-group"), th = h("th"), count = h("span", "cx-prop-groupcount");
          th.scope = "rowgroup"; th.colSpan = 5; setText(th, group);
          setText(count, " · " + changeCount(doc.groupCount || "{count}", members.length, this.lang, { count: this.format.format(members.length) }));
          th.appendChild(count); tr.appendChild(th); body.appendChild(tr);
        }
        for (const witness of members) body.appendChild(this.row(witness, start, span));
        table.appendChild(body);
      }
      this.root.replaceChildren(head, counts, table);
    }
    row(witness, start, span) {
      const labels = this.labels, tr = h("tr", "cx-prop-row cx-prop-" + witness.state), name = h("th"), state = h("td", "cx-prop-statecell"), first = h("td", "cx-prop-first"), last = h("td", "cx-prop-last"), lane = h("td", "cx-prop-lanecell");
      name.scope = "row";
      const label = h("span", "cx-prop-name"); setText(label, witness.label); name.appendChild(label);
      if (witness.source) { const mark = h("span", "cx-prop-source"); setText(mark, labels.changeSource); name.appendChild(mark); }
      if (witness.secondary) { const sub = h("span", "cx-prop-sub"); setText(sub, witness.secondary); name.appendChild(sub); }
      state.appendChild(this.badge(witness.state, "cx-prop-badge"));
      if (witness.note) { const note = h("span", "cx-prop-sub"); setText(note, witness.note); state.appendChild(note); }
      let delay = null;
      if (witness.firstSeen !== null) {
        const time = h("span"); setText(time, changeTimeText(witness.firstSeen, this.doc.local, labels)); first.appendChild(time);
        if (start !== null && !witness.source) { delay = fill(labels.changeDelay, { duration: changeDuration(witness.firstSeen - start, labels, this.format) }); const sub = h("span", "cx-prop-delay"); setText(sub, delay); first.appendChild(sub); }
      } else { const none = h("span", "cx-prop-none"); setText(none, labels.changeNotSeen); first.appendChild(none); }
      setText(last, witness.lastSeen !== null ? changeTimeText(witness.lastSeen, this.doc.local, labels) : "");
      // The lane: from the change to the evidence time; the fill ends where the change was first seen, or runs on while it is not.
      const track = h("div", "cx-prop-lane"), fillBar = h("div", "cx-prop-fill");
      track.setAttribute("aria-hidden", "true");
      const reached = witness.firstSeen !== null && span ? Math.min(1, Math.max(0, (witness.firstSeen - start) / span)) : witness.state === "unknown" || !span ? 0 : 1;
      fillBar.style.width = (reached * 100).toFixed(1) + "%";
      applyTone(fillBar, "cx-prop-fill" + (witness.firstSeen === null && witness.state !== "unknown" ? " cx-prop-open" : ""), toneOf(PROPAGATION_LOOK[witness.state][1]));
      track.appendChild(fillBar);
      if (delay) track.title = delay;
      lane.appendChild(track);
      tr.append(name, state, first, last, lane);
      return tr;
    }
    update(view) {
      this.doc = propagationDocument(view); this.labels = changeLabels(this.doc.labels, this.options.labels); this.source = view; this.render();
    }
  }

  function propagationCreate(host, options) {
    const view = new PropagationView(host, options);
    const impl = {
      ready: Promise.resolve().then(() => { if (view.destroyed) return impl; host.setAttribute("data-cx-ready", ""); view.emit("propagationReady", { propagation: view.doc.id }, "onReady"); return impl; }),
      document: () => view.source || options.view, update: next => view.update(next),
      destroy: () => {
        if (view.destroyed) return;
        view.destroyed = true; view.lifetime.abort(); view.root.remove(); host.removeAttribute("data-cx-ready");
      }
    };
    return impl;
  }
  Object.assign(CHANGES_IMPL, { diff: diffCreate, changes: changeListCreate, propagation: propagationCreate, validatePropagation: propagationDocument });
