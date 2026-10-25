  // ---------- changes: a change list's rows, their details and their actions ----------
  // A row: the details button, the kind's badge, the name (or the whole path) with its flags and a quiet second line, the size and the
  // short hash before and after (the whole hash is the tooltip and what a click copies), and the item's actions. The details list the
  // flags with their reasons, the versions and facts side by side, and the item's diff, which mounts the first time they open.
  Object.assign(ChangeListView.prototype, {
    row(item) {
      const labels = this.labels, doc = this.doc, open = this.open.has(item.id), [folder, name] = changePath(item.path);
      const li = h("li", "cx-chg-item" + (item.flags.length ? " cx-chg-flagged" : "")), row = h("div", "cx-chg-row");
      li.setAttribute("data-cx-item", item.id);
      const toggle = h("button", "cx-chg-toggle"), detailId = (this.host.id || "cx-changes") + "-" + this.uid() + "-detail";
      toggle.type = "button"; toggle.setAttribute("aria-expanded", String(open)); toggle.setAttribute("aria-label", fill(labels.changeDetails, { name: doc.groupByFolder ? name : item.path }));
      toggle.appendChild(changeIcon("chevron"));
      const badge = h("span");
      applyTone(badge, "cx-chg-badge", toneOf(CHANGE_TONES[item.kind])); setText(badge, item.kindLabel || labels["change" + item.kind[0].toUpperCase() + item.kind.slice(1)]);
      const main = h("div", "cx-chg-main"), title = h("div", "cx-chg-title"), nameText = h("span", "cx-chg-name");
      setText(nameText, doc.groupByFolder ? name : item.path); nameText.title = item.path; title.appendChild(nameText);
      if (item.previousPath) { const from = h("span", "cx-chg-from"); setText(from, fill(labels.changeFrom, { path: item.previousPath })); title.appendChild(from); }
      main.appendChild(title);
      if (item.flags.length) {
        const flags = h("div", "cx-chg-flags");
        for (const flag of item.flags) { const chip = h("span"); applyTone(chip, "cx-chg-flag", toneOf(flag.tone)); chip.title = flag.reason; chip.append(changeIcon("flag"), document.createTextNode(flag.label)); flags.appendChild(chip); }
        main.appendChild(flags);
      }
      const second = [item.secondary, (item.after || item.before)?.time != null ? changeTimeText((item.after || item.before).time, doc.local, labels) : null].filter(Boolean);
      if (second.length) { const line = h("div", "cx-chg-sub"); setText(line, second.join(" · ")); main.appendChild(line); }
      const meta = h("div", "cx-chg-meta"), size = h("span", "cx-chg-size"), hash = h("span", "cx-chg-hash");
      setText(size, this.pair(item.before?.size, item.after?.size, value => changeSize(value, this.lang)));
      for (const [index, version] of [item.before, item.after].entries()) {
        if (!version || !version.hash || index === 1 && item.before?.hash === version.hash) continue;
        if (hash.childNodes.length) { const arrow = h("span", "cx-chg-arrow"); setText(arrow, "→"); arrow.setAttribute("aria-hidden", "true"); hash.appendChild(arrow); }
        const button = h("button", "cx-chg-hashbtn"); button.type = "button"; button._copy = version.hash; button.title = labels.changeCopyHash + ": " + version.hash;
        button.setAttribute("aria-label", labels.changeCopyHash + ": " + version.hash);
        setText(button, version.hash.length > doc.hashLength ? version.hash.slice(0, doc.hashLength) + "…" : version.hash); hash.appendChild(button);
      }
      meta.append(size, hash);
      const actions = h("div", "cx-chg-actions");
      actions.setAttribute("role", "group"); actions.setAttribute("aria-label", fill(labels.changeActions, { name }));
      for (const action of doc.actions) { const control = this.actionControl(action, item); if (control) actions.appendChild(control); }
      row.append(toggle, badge, main, meta, actions);
      li.appendChild(row);
      if (this.pending && this.pending.item === item) li.appendChild(this.panel());
      if (open) { const detail = this.detail(item); detail.id = detailId; toggle.setAttribute("aria-controls", detailId); li.appendChild(detail); }
      return li;
    },
    uid() { return (this.seq = (this.seq || 0) + 1); },
    pair(before, after, format) {
      const left = before == null ? null : format(before), right = after == null ? null : format(after);
      return left === null ? right ?? "" : right === null || left === right ? left : left + " → " + right;
    },
    detail(item) {
      const labels = this.labels, doc = this.doc, box = h("div", "cx-chg-detail");
      if (item.flags.length) {
        const heading = h("div", "cx-chg-dhead"), list = h("ul", "cx-chg-reasons");
        setText(heading, labels.changeFlags);
        for (const flag of item.flags) { const entry = h("li"), label = h("strong"); applyTone(label, "cx-chg-reason", toneOf(flag.tone)); setText(label, flag.label); entry.append(label, document.createTextNode(" — " + flag.reason)); list.appendChild(entry); }
        box.append(heading, list);
      }
      const rows = [], local = doc.local;
      if (item.before?.size != null || item.after?.size != null) rows.push([labels.changeSize, item.before?.size != null ? changeSize(item.before.size, this.lang) : null, item.after?.size != null ? changeSize(item.after.size, this.lang) : null, null, false]);
      if (item.before?.hash || item.after?.hash) rows.push([labels.changeHash, item.before?.hash ?? null, item.after?.hash ?? null, null, true]);
      if (item.before?.time != null || item.after?.time != null) rows.push([labels.changeTime, item.before?.time != null ? changeTimeText(item.before.time, local, labels) : null, item.after?.time != null ? changeTimeText(item.after.time, local, labels) : null, null, false]);
      for (const fact of item.facts) rows.push([fact.label, fact.before, fact.after, fact.tone, false, fact.note]);
      if (rows.length) {
        // An added item has only an after, a removed one only a before: one value column, never a column of dashes.
        // A fact with a value on the other side keeps both columns, so no value appears under the wrong heading.
        const other = item.kind === "added" ? 0 : item.kind === "removed" ? 1 : -1;
        const sides = other < 0 || rows.some(row => (other ? row[2] : row[1]) != null) ? [0, 1] : [1 - other];
        const table = h("table", "cx-chg-facts" + (sides.length === 1 ? " cx-chg-onevalue" : "")), head = h("tr");
        for (const text of ["", ...sides.map(side => side ? labels.changeAfter : labels.changeBefore)]) { const th = h("th"); th.scope = "col"; setText(th, text); head.appendChild(th); }
        const thead = h("thead"), tbody = h("tbody"); thead.appendChild(head);
        for (const [label, before, after, tone, mono, note] of rows) {
          const tr = h("tr"), th = h("th"); th.scope = "row"; setText(th, label); tr.appendChild(th);
          sides.forEach((side, at) => {
            const value = side ? after : before;
            // The empty mark is the same glyph in every row, so it never takes the monospaced font of hashes.
            const td = h("td", (mono && value !== null ? "cx-chg-mono" : "") + (side === 1 && sides.length === 2 && before !== null && after !== null && before !== after ? " cx-chg-changed" : ""));
            setText(td, value ?? "—"); if ((side === 1 || sides.length === 1) && tone) applyTone(td, td.className, toneOf(tone));
            if (note && at === sides.length - 1) { const small = h("div", "cx-chg-factnote"); setText(small, note); td.appendChild(small); }
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        }
        table.append(thead, tbody); box.appendChild(table);
      }
      if (item.diff) {
        let diff = this.diffs.get(item.id);
        if (!diff) { const holder = h("div", "cx-chg-diff"); diff = diffCreate(holder, { labels: this.options.labels, baseLabels: this.doc.labels, lang: this.lang }, item.diff); diff.holder = holder; this.diffs.set(item.id, diff); }
        box.appendChild(diff.holder);
      }
      return box;
    },
    onClick(event) {
      const target = event.target.closest?.("button, a.cx-chg-action");
      if (!target || !this.root.contains(target)) return;
      if (target._export) { this.exportItems(target._export); return; }
      if (target.classList.contains("cx-chg-kind")) { const kinds = new Set(this.kinds); if (kinds.has(target._kind)) kinds.delete(target._kind); else kinds.add(target._kind); this.applyState({ kinds: [...kinds] }); [...this.bar.querySelectorAll(".cx-chg-kind")].find(button => button._kind === target._kind)?.focus(); return; }
      if (target.classList.contains("cx-chg-toggle")) { const id = target.closest("[data-cx-item]").getAttribute("data-cx-item"); this.toggle(id); this.focusItem(id); return; }
      if (target.classList.contains("cx-chg-hashbtn")) { this.copyText(target._copy); return; }
      if (target._action) this.act(target._action, target._item, target);
    },
    async copyText(text) {
      const ok = await changeCopy(text);
      if (!this.destroyed) setText(this.live, ok ? this.labels.changeCopied : this.labels.changeCopyFailed);
      return ok;
    },

    /** Up and Down move between the items' details buttons; the other keys are the controls' own. */
    onKey(event) {
      if (!event.target.classList?.contains("cx-chg-toggle") || event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
      const toggles = [...this.list.querySelectorAll(".cx-chg-toggle")], at = toggles.indexOf(event.target);
      const next = event.key === "Home" ? 0 : event.key === "End" ? toggles.length - 1 : at + (event.key === "ArrowDown" ? 1 : -1);
      if (next < 0 || next >= toggles.length) return;
      event.preventDefault(); toggles[next].focus();
    }
  });

  function changeListCreate(host, options) {
    const view = new ChangeListView(host, options);
    const impl = {
      ready: Promise.resolve().then(() => { if (view.destroyed) return impl; host.setAttribute("data-cx-ready", ""); view.emit("changesReady", { list: view.doc.id }, "onReady"); return impl; }),
      document: () => view.source || options.view, getState: () => view.getState(), setState: state => view.applyState(state),
      toggle: (id, open) => view.toggle(id, open), focusItem: id => view.focusItem(id), update: next => view.update(next),
      destroy: () => {
        if (view.destroyed) return;
        view.destroyed = true; view.lifetime.abort(); view.panelLife?.abort();
        for (const diff of view.diffs.values()) diff.destroy();
        view.root.remove(); host.removeAttribute("data-cx-ready");
      }
    };
    return impl;
  }
