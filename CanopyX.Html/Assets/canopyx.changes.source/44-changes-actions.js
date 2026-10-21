  // ---------- changes: the change list's actions, its bar's tools and its exports ----------
  // An action copies a value, opens a value as a link, reveals the item's details or diff, or is the host's: the list raises
  // canopyx:changeAction (cancelable) and the host claims it by cancelling it or through onAction. An action that asks for a reason
  // shows a field first. An action nobody claims says so and offers its request as JSON, so a read-only page never fails silently.
  const CHANGE_LINK = /^(?:#|\/(?!\/)|\.{1,2}\/|https?:\/\/|mailto:)/i;
  /** The address a link action opens, or null when it has none or it is not one CanopyX opens (only #, relative, http(s) and mailto). */
  function changeHref(value) {
    if (typeof value !== "string") return null;
    const href = value.trim();
    // Backslashes and control characters are refused: browsers read "/\host" and "/<tab>/host" as another site.
    return CHANGE_LINK.test(href) && !/[\\\u0000-\u001f\u007f]/.test(href) ? href : null;
  }
  /** Writes a file the reader saves; false when the browser has no way to. */
  function changeDownload(name, type, text) {
    if (typeof Blob !== "function" || !global.URL || typeof URL.createObjectURL !== "function") return false;
    const url = URL.createObjectURL(new Blob([text], { type })), link = h("a");
    link.href = url; link.download = name; link.hidden = true;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  /** A CSV field: quoted when it holds a comma, quote or line break, and kept from being read as a spreadsheet formula. */
  function changeCsvField(value) {
    let text = value == null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? "\"" + text.replace(/"/g, "\"\"") + "\"" : text;
  }
  function changeIso(time) { return time == null ? null : new Date(time).toISOString(); }
  /** An item's diff as export data: its unified text when the hunks are known or the texts are short enough to compare here. */
  function changeExportDiff(diff) {
    if (!diff) return null;
    let hunks = diff.hunks;
    const canCompare = diff.left && diff.left.length <= DIFF_CLIENT_LINES && diff.right.length <= DIFF_CLIENT_LINES;
    if (diff.content === "text" && !hunks.length && canCompare) hunks = diffHunks(diff.left, diff.right, diff.context);
    const unified = diff.content === "text" && (diff.unified !== null || hunks.length || canCompare) ? diffUnified(diff, hunks) : null;
    return { content: diff.content, message: diff.message, unified, truncated: diff.truncated };
  }
  function changeExportVersion(version) { return version ? { size: version.size, hash: version.hash, time: changeIso(version.time) } : null; }
  function changeExportItem(item) {
    return { id: item.id, kind: item.kind, kindLabel: item.kindLabel, path: item.path, previousPath: item.previousPath, secondary: item.secondary,
      before: changeExportVersion(item.before), after: changeExportVersion(item.after), flags: item.flags.map(flag => ({ id: flag.id, label: flag.label, reason: flag.reason, tone: flag.tone })),
      facts: item.facts.map(fact => ({ label: fact.label, before: fact.before, after: fact.after, note: fact.note })), values: { ...item.values }, diff: changeExportDiff(item.diff) };
  }
  function changeCsv(items) {
    const keys = [...new Set(items.flatMap(item => Object.keys(item.values)))].sort();
    const head = ["kind", "kindLabel", "path", "previousPath", "secondary", "sizeBefore", "sizeAfter", "hashBefore", "hashAfter", "timeBefore", "timeAfter", "flags", "facts"].concat(keys.map(key => "values." + key));
    const rows = [head].concat(items.map(item => [item.kind, item.kindLabel, item.path, item.previousPath, item.secondary, item.before?.size, item.after?.size, item.before?.hash, item.after?.hash,
      changeIso(item.before?.time), changeIso(item.after?.time), item.flags.map(flag => flag.label + ": " + flag.reason).join(" | "),
      item.facts.map(fact => fact.label + ": " + (fact.before ?? "") + (fact.before != null && fact.after != null ? " → " : "") + (fact.after ?? "") + (fact.note ? " (" + fact.note + ")" : "")).join(" | ")].concat(keys.map(key => item.values[key]))));
    return rows.map(row => row.map(changeCsvField).join(",")).join("\r\n") + "\r\n";
  }

  Object.assign(ChangeListView.prototype, {
    /** The control of an action on an item, or on the bar when the item is null; null when the item does not offer it. */
    actionControl(action, item) {
      if (item && item.actions.length && !item.actions.includes(action.id)) return null;
      const values = item ? item.values : this.doc.values;
      const value = key => key === null ? null : item && key === "path" ? item.path : item && key === "previousPath" ? item.previousPath : values[key] ?? null;
      if (action.copy !== null && value(action.copy) === null) return null;
      const href = action.link === null ? null : changeHref(value(action.link));
      if (action.link !== null && href === null) return null;
      if (action.reveal === "diff" && !item.diff) return null;
      const control = h(href ? "a" : "button", "cx-chg-action" + (action.icon === "none" || !item ? " cx-chg-textaction" : ""));
      if (href) control.href = href; else control.type = "button";
      control._action = action; control._item = item;
      control.setAttribute("data-cx-action", action.id);
      if (action.icon !== "none") control.appendChild(changeIcon(action.icon));
      if (action.icon === "none" || !item) control.appendChild(document.createTextNode(action.label));
      else { control.setAttribute("aria-label", action.label); control.setAttribute("data-cx-tip", action.label); }
      if (action.reason) control.setAttribute("aria-expanded", String(!!(this.pending && this.pending.mode === "ask" && this.pending.action === action && this.pending.item === item)));
      return control;
    },
    /** The bar's tools: its actions and its exports. */
    tools() {
      const tools = h("div", "cx-chg-tools");
      tools.setAttribute("role", "group"); tools.setAttribute("aria-label", fill(this.labels.changeActions, { name: this.doc.label }));
      for (const action of this.doc.toolbar) { const control = this.actionControl(action, null); if (control) tools.appendChild(control); }
      for (const format of this.doc.exports) {
        const button = h("button", "cx-chg-action cx-chg-textaction cx-chg-export"); button.type = "button"; button._export = format;
        button.append(changeIcon("download"), document.createTextNode(format === "csv" ? this.labels.changeExportCsv : this.labels.changeExportJson));
        tools.appendChild(button);
      }
      return tools.childNodes.length ? tools : null;
    },
    detailOf(action, item, extra) {
      return Object.assign({ list: this.doc.id, action: action.id, item: item ? item.id : null, kind: item ? item.kind : null, path: item ? item.path : null,
        previousPath: item ? item.previousPath : null, values: { ...(item ? item.values : this.doc.values) }, copied: null }, extra);
    },
    /** Raises a host action; true when a handler claims it (cancels the event or has onAction). */
    request(detail) {
      const event = new CustomEvent("canopyx:changeAction", { detail, bubbles: true, cancelable: true });
      this.host.dispatchEvent(event);
      let claimed = event.defaultPrevented;
      if (typeof this.options.onAction === "function") {
        // A handler that fails has not carried the action out, so the reader still gets the request to pass on.
        try { this.options.onAction(detail, event); claimed = true; } catch (error) { this.host.dispatchEvent(new CustomEvent("canopyx:error", { detail: { error, hook: "onAction" }, bubbles: true })); }
      }
      return claimed;
    },
    /** Carries out an action: copy, link (the browser follows it), reveal, or the host's, asking for a reason first when the action does. */
    async act(action, item, control) {
      if (action.copy !== null) {
        const key = action.copy, copied = await this.copyText(item && key === "path" ? item.path : item && key === "previousPath" ? item.previousPath : (item ? item.values : this.doc.values)[key]);
        if (!this.destroyed) this.emit("changeAction", this.detailOf(action, item, { copied }), "onAction");
        return;
      }
      if (action.link !== null) { this.emit("changeAction", this.detailOf(action, item, { href: control.getAttribute("href") }), "onAction"); return; }
      if (action.reveal !== "none") { this.reveal(item.id, action.reveal); this.emit("changeAction", this.detailOf(action, item, { reveal: action.reveal }), "onAction"); return; }
      if (action.reason) { this.pending = { mode: "ask", action, item, text: "", error: false }; this.render(); this.focusPanel(); return; }
      this.send(action, item, null);
    },
    send(action, item, reason) {
      const detail = this.detailOf(action, item, reason === null ? {} : { reason });
      const claimed = this.request(detail);
      // The host may have destroyed or replaced the list while it handled the action.
      if (this.destroyed) return;
      if (item ? !this.doc.items.includes(item) : !this.doc.toolbar.includes(action)) { this.pending = null; this.render(); return; }
      this.pending = claimed ? null : { mode: "note", action, item, detail };
      this.render();
      if (this.pending) this.focusPanel(); else this.focusAction(action, item);
    },
    /** Opens an item and brings its details or its diff into view. */
    reveal(id, what) {
      this.toggle(id, true);
      const box = this.list.querySelector("[data-cx-item=\"" + CSS.escape(id) + "\"] > .cx-chg-detail");
      if (!box) return;
      const target = what === "diff" ? box.querySelector(".cx-chg-diff .cx-diff-scroll") || box : box;
      if (target === box) box.tabIndex = -1;
      target.scrollIntoView?.({ block: "nearest" }); target.focus({ preventScroll: true });
    },
    /** The field that asks for a reason, or the note of an action nobody carried out. */
    panel() {
      // Each panel's listeners end with the panel: the next render replaces it.
      this.panelLife?.abort(); this.panelLife = new AbortController();
      const pending = this.pending, labels = this.labels, signal = this.panelLife.signal, box = h("div", "cx-chg-panel");
      box.setAttribute("role", "group"); box.setAttribute("aria-label", pending.action.label);
      const cancel = h("button", "cx-chg-action cx-chg-textaction"); cancel.type = "button"; setText(cancel, labels.changeCancel);
      cancel.addEventListener("click", () => { const { action, item } = pending; this.pending = null; this.render(); this.focusAction(action, item); }, { signal });
      if (pending.mode === "note") {
        const text = h("p", "cx-chg-note"), copy = h("button", "cx-chg-action cx-chg-textaction"); copy.type = "button";
        setText(text, fill(labels.changeUnclaimed, { action: pending.action.label }));
        copy.append(changeIcon("copy"), document.createTextNode(labels.changeCopyRequest));
        copy.addEventListener("click", () => this.copyText(JSON.stringify(pending.detail, null, 2)), { signal });
        const buttons = h("div", "cx-chg-askbtns"); buttons.append(copy, cancel); box.append(text, buttons);
        return box;
      }
      const id = (this.host.id || "cx-changes") + "-reason-" + this.uid(), field = h("textarea", "cx-chg-reasonbox"), label = h("label", "cx-chg-asklabel"), hint = h("div", "cx-chg-hint");
      field.id = id; field.rows = 2; field.maxLength = 1000; field.value = pending.text; field.setAttribute("aria-describedby", id + "-hint");
      label.htmlFor = id; setText(label, labels.changeReason); hint.id = id + "-hint"; setText(hint, fill(labels.changeReasonHint, { action: pending.action.label }));
      const error = h("div", "cx-chg-askerror"); error.setAttribute("role", "alert"); setText(error, pending.error ? labels.changeReasonRequired : "");
      if (pending.error) field.setAttribute("aria-invalid", "true");
      const confirm = h("button", "cx-chg-action cx-chg-textaction cx-chg-primary"); confirm.type = "button"; setText(confirm, pending.action.label);
      const submit = () => {
        const reason = field.value.trim();
        if (!reason) { pending.error = true; pending.text = field.value; this.render(); this.focusPanel(); return; }
        this.send(pending.action, pending.item, reason);
      };
      confirm.addEventListener("click", submit, { signal });
      field.addEventListener("input", () => { pending.text = field.value; }, { signal });
      field.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel.click(); }
        else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); }
      }, { signal });
      const buttons = h("div", "cx-chg-askbtns"); buttons.append(confirm, cancel);
      box.append(label, field, hint, error, buttons);
      return box;
    },
    focusPanel() { const target = this.root.querySelector(".cx-chg-panel :is(textarea, button)"); if (target) target.focus(); },
    focusAction(action, item) {
      const scope = item ? this.list.querySelector("[data-cx-item=\"" + CSS.escape(item.id) + "\"] > .cx-chg-row") : this.bar;
      scope?.querySelector("[data-cx-action=\"" + CSS.escape(action.id) + "\"]")?.focus();
    },
    /** Downloads the items the filters keep, in the order the list shows them, as CSV or JSON, and tells the host. */
    exportItems(format) {
      const items = this.folders(this.visible()).flatMap(group => group[2]), name = (this.doc.id.replace(/[^\w.-]+/g, "-") || "changes") + "." + format;
      const text = format === "csv" ? "﻿" + changeCsv(items)
        : JSON.stringify({ list: this.doc.id, label: this.doc.label, exported: new Date().toISOString(), filters: { kinds: [...this.kinds], flaggedOnly: this.flaggedOnly }, items: items.map(changeExportItem) }, null, 2);
      const saved = changeDownload(name, format === "csv" ? "text/csv;charset=utf-8" : "application/json", text);
      this.emit("changeExport", { list: this.doc.id, format, count: items.length, saved }, "onExport");
      return saved;
    }
  });
