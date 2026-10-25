  // ---------- record panel: record actions ----------
  // The head's actions menu: copy link (with deep links), copy values (tab-separated) or JSON, export CSV or JSON, print the
  // record alone, then the host's recordActions option and plugins' recordActions ({ label, run({ record, view, api, payload,
  // signal }) }). record.actions switches the built-in ones off. Exports carry every field with its section, empty ones too.
  function recordActionsMenu(view, dialog, identity) {
    dialog.querySelector(".cx-record-footer")?.remove();
    const spec = recordSpec(view), switches = spec.actions || {}, labels = view.labels, items = [];
    const add = (label, task) => items.push({ label, task });
    if (switches.link !== false && spec.deepLink) add(labels.recordCopyLink, () => recordCopy(view, dialog, recordAddress(view, dialog._cxRecord)));
    if (switches.copy !== false) { add(labels.recordCopyValues, () => recordCopy(view, dialog, recordExport(view, dialog, "text"))); add(labels.recordCopyJson, () => recordCopy(view, dialog, recordExport(view, dialog, "json"))); }
    if (switches.export !== false) { add(labels.recordExportCsv, () => recordDownload(view, dialog, "csv")); add(labels.recordExportJson, () => recordDownload(view, dialog, "json")); }
    if (switches.print !== false) add(labels.recordPrint, () => recordPrint(view, dialog));
    for (const action of [...(Array.isArray(view.opts.recordActions) ? view.opts.recordActions : []), ...view.plugins.flatMap(item => item.recordActions || [])]) {
      if (!action || typeof action.label !== "string" || typeof action.run !== "function") continue;
      const task = () => { const record = dialog._cxRecord, entry = recordEntry(view, record.id);
        return action.run(Object.freeze({ record: JSON.parse(JSON.stringify(record)), view: view.view.id, api: view.host.canopyx, payload: entry?.payload || null, signal: view.lifetime.signal })); };
      add(action.label, task);
      if (action.prominent === true) {
        let footer = dialog.querySelector(".cx-record-footer");
        if (!footer) { footer = h("footer", "cx-record-footer"); dialog.appendChild(footer); }
        const button = recordButton(action.label, () => {
          if (button.disabled) return;
          button.disabled = true;
          Promise.resolve().then(task).catch(error => { recordAnnounce(dialog, error.message); view.emit("error", { error }); })
            .finally(() => { button.disabled = false; });
        }, "cx-record-btn cx-record-primary");
        footer.appendChild(button);
      }
    }
    if (!items.length) return;
    // A menu button: Enter, Space or a click opens the menu on its first item; arrows move, Escape or Tab closes it.
    const menu = h("div", "cx-record-menu"), toggle = recordButton("", () => show(list.hidden), "cx-record-menu-btn", "more"), list = h("div", "cx-record-menu-list");
    list.id = dialog.id + "-actions"; list.setAttribute("role", "menu"); list.setAttribute("aria-label", labels.recordActions); list.hidden = true;
    toggle.setAttribute("aria-label", labels.recordActions); toggle.title = labels.recordActions;
    toggle.setAttribute("aria-haspopup", "menu"); toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-controls", list.id);
    const show = open => {
      list.hidden = !open; toggle.setAttribute("aria-expanded", String(open));
      if (open) buttons[0].focus();
    };
    const buttons = items.map(item => {
      const button = recordButton(item.label, () => {
        show(false); toggle.focus();
        Promise.resolve().then(item.task).catch(error => { recordAnnounce(dialog, error.message); view.emit("error", { error }); });
      }, "cx-record-menu-item");
      button.setAttribute("role", "menuitem"); button.tabIndex = -1;
      return button;
    });
    list.append(...buttons); menu.append(toggle, list); identity.after(menu);
    menu.addEventListener("keydown", event => {
      if (list.hidden) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); show(false); toggle.focus(); return; }
      if (event.key === "Tab") { show(false); return; }
      const at = buttons.indexOf(document.activeElement);
      if (at < 0 || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      buttons[{ ArrowDown: (at + 1) % buttons.length, ArrowUp: (at - 1 + buttons.length) % buttons.length, Home: 0, End: buttons.length - 1 }[event.key]].focus();
    });
    menu.addEventListener("focusout", event => { if (!menu.contains(event.relatedTarget) && event.relatedTarget) show(false); });
    dialog.addEventListener("pointerdown", event => { if (!menu.contains(event.target)) show(false); });
  }
  async function recordCopy(view, dialog, text) {
    if (!global.navigator.clipboard?.writeText) recordFail("the clipboard is not available.");
    await global.navigator.clipboard.writeText(text);
    recordAnnounce(dialog, view.labels.recordCopied);
  }

  // Display text of any value, structured ones flattened: lists joined, objects as name: value, collections and timelines by line.
  function recordFlat(cell, field, fmt) {
    const kind = recordKind(cell), text = (value, spec = field) => recordFlat(value, spec, fmt);
    if (kind === "items") return cell.items.map(item => text(item)).join(", ");
    if (kind === "fields") return cell.fields.map(entry => entry.name + ": " + text(entry.value, { kind: entry.kind || "text" })).join("; ");
    if (kind === "records") return (cell.records.rows || cell.records.roots || []).map(row => cell.records.columns.map(column => text(row.cells?.[column.id] ?? null, column)).filter(Boolean).join(" · ")).join("\n");
    if (kind === "events") return cell.events.map(event => [event.time ? formatValue(event.time, "datetime", fmt) : "", event.kind, event.actor, event.summary].filter(Boolean).join(" · ")).join("\n");
    if (kind === "changes") return cell.changes.map(change => change.name + ": " + text(change.before ?? null) + " → " + text(change.after ?? null)).join("\n");
    return cellText(cell, field.column || field, fmt);
  }
  function recordData(view, dialog) {
    const record = dialog._cxRecord, entry = recordEntry(view, record.id), payload = entry?.state === "ready" ? entry.payload : null;
    const fields = recordFields(view), layout = recordLayout(view, fields), items = [], seen = new Set();
    const walk = (sections, path) => {
      for (const section of sections) {
        const name = path ? path + " / " + section.label : section.label;
        for (const field of section.fields) if (!seen.has(field.id)) { seen.add(field.id); items.push({ section: name, field, cell: recordCell(view, record, payload, field) }); }
        walk(section.sections, name);
      }
    };
    walk(layout.tabs.flatMap(tab => tab.sections), "");
    // Header-only facts and the title field are still fields of the exported record.
    for (const field of fields) if (!seen.has(field.id)) items.push({ section: "", field, cell: recordCell(view, record, payload, field) });
    return { record, items };
  }
  function recordExport(view, dialog, format) {
    const { record, items } = recordData(view, dialog), labels = view.labels, title = recordTitle(dialog);
    if (format === "json") return JSON.stringify({ view: view.view.id, id: record.id, title, fields: items.map(item =>
      ({ id: item.field.id, title: item.field.title, section: item.section, text: recordFlat(item.cell, item.field, view.fmt), value: item.cell === undefined ? null : item.cell })) }, null, 2);
    const rows = items.map(item => [item.section, item.field.title,
      format === "csv" && item.field.kind === "number" && typeof cellValue(item.cell) === "number" ? cellValue(item.cell) : recordFlat(item.cell, item.field, view.fmt)]);
    if (format === "text") return [title, ...rows.map(row => row[1] + "\t" + row[2].replace(/\s*\n\s*/g, "; "))].join("\n");
    // CSV: quoted fields, and text that a spreadsheet would run as a formula starts with an apostrophe.
    // Keep the record CSV's quoted-field shape while sharing the grid's spreadsheet formula protection.
    const quote = value => {
      const escaped = gridExportField(value, ",");
      return escaped.startsWith('"') ? escaped : '"' + escaped + '"';
    };
    return [[labels.recordSection, labels.recordField, labels.recordValue], ...rows].map(row => row.map(quote).join(",")).join("\r\n");
  }
  function recordDownload(view, dialog, format) {
    const text = recordExport(view, dialog, format), record = dialog._cxRecord;
    const blob = new Blob([format === "csv" ? "﻿" + text : text], { type: format === "csv" ? "text/csv;charset=utf-8" : "application/json" });
    const link = h("a"); link.href = URL.createObjectURL(blob); link.download = (view.view.id + "-" + record.id).replace(/[^\w.-]+/g, "_").slice(0, 100) + "." + format;
    link.hidden = true; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  }

  // Print one record: every tab and section expanded, collections as full tables, on a sheet the print stylesheet shows alone.
  // canopyx:recordPrint (cancelable, { id, element, dispose }) lets a host print the sheet its own way and dispose it after.
  let recordPrintDispose;
  async function recordPrint(view, dialog) {
    if (view.destroyed || !dialog.isConnected) return;
    recordPrintDispose?.();
    const record = dialog._cxRecord, entry = recordEntry(view, record.id), payload = entry?.state === "ready" ? entry.payload : null;
    // The sheet's ids differ from the drawer's, which stays in the page while printing.
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, view.lifetime.signal]);
    const sheetOwner = Object.create(dialog, { id: { value: dialog.id + "-print" } });
    const ctx = recordContext(view, record, sheetOwner, { signal, print: true, index: null }, payload);
    const layout = recordLayout(view, recordFields(view)), showEmpty = RECORD_SHOW_EMPTY || !layout.hideEmpty, sheet = h("div", "cx-host cx-record-print"), heading = h("h1");
    let disposed = false;
    const changed = () => { if (dialog._cxRecord !== record) done(); };
    const done = () => {
      if (disposed) return;
      disposed = true; document.documentElement.classList.remove("cx-record-printing"); sheet.remove(); controller.abort();
      global.removeEventListener("afterprint", done); dialog.removeEventListener("close", done); dialog.removeEventListener("cx-drawer-paint", changed); signal.removeEventListener("abort", done);
      if (recordPrintDispose === done) recordPrintDispose = null;
    };
    recordPrintDispose = done; signal.addEventListener("abort", done, { once: true }); dialog.addEventListener("close", done, { once: true });
    dialog.addEventListener("cx-drawer-paint", changed);
    sheet.setAttribute("data-cx-theme", "light"); setText(heading, recordTitle(dialog)); sheet.appendChild(heading);
    const subtitle = dialog.querySelector(".cx-drawer-h p"); if (subtitle && !subtitle.hidden) { const line = h("p", "cx-record-print-sub"); setText(line, subtitle.textContent); sheet.appendChild(line); }
    const summary = dialog.querySelector(".cx-record-summary"); if (summary && !summary.hidden) sheet.appendChild(summary.cloneNode(true));
    for (const tab of layout.tabs) {
      const sections = tab.sections.map(section => recordSection(ctx, section, { collapsed: new Map() }, showEmpty)).filter(Boolean);
      if (!sections.length) continue;
      if (layout.tabs.length > 1) { const name = h("h2"); setText(name, tab.label); sheet.appendChild(name); }
      sheet.append(...sections);
    }
    document.body.appendChild(sheet);
    const cancelled = new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException("Record print cancelled.", "AbortError"));
      if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    });
    try { await Promise.race([Promise.all(ctx.pending), cancelled]); }
    catch (error) { done(); if (error.name !== "AbortError") throw error; return; }
    if (signal.aborted) return;
    // A host that prints the sheet itself calls dispose when it is done with it.
    if (!recordEmit(view, "recordPrint", Object.freeze({ id: record.id, element: sheet, dispose: done }))) return;
    if (signal.aborted) return;
    document.documentElement.classList.add("cx-record-printing");
    global.addEventListener("afterprint", done);
    global.print();
  }
