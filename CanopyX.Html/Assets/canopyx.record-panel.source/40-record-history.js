  // ---------- record panel: timelines and before/after changes ----------
  // A timeline is a list of events { time, summary, actor?, kind?, tone?, ref?, changes? } in the order given (newest first is
  // usual), grouped by day; an event's changes show under it. Changes are { name, before, after } rows: a before/after table
  // where lists show the items removed and added (marked with text, not colour alone).
  function recordTimeline(ctx, field, events, element) {
    const list = h("ol", "cx-timeline"), limit = ctx.print ? events.length : 20;
    let day = null;
    const add = event => {
      if (!event || typeof event !== "object" || !recordText(event.summary, 4096) || event.time !== undefined && typeof event.time !== "string")
        recordFail("a timeline event has a summary and an ISO time.");
      const label = event.time ? formatValue(event.time, "datetime", ctx.fmt) : "", date = label.slice(0, 10);
      if (date && date !== day) { day = date; const heading = h("li", "cx-timeline-day"); setText(heading, day); list.appendChild(heading); }
      const item = h("li", "cx-timeline-item"), dot = h("span"), main = h("div", "cx-timeline-main"), meta = h("div", "cx-timeline-meta"), summary = h("div", "cx-timeline-summary");
      applyTone(dot, "cx-timeline-dot", toneOf(event.tone || "neutral")); dot.setAttribute("aria-hidden", "true");
      if (label) { const time = h("time"); time.dateTime = event.time; time.title = label; setText(time, label.length > 11 ? label.slice(11) : label); meta.appendChild(time); }
      if (event.kind) { const kind = h("span"); applyTone(kind, "cx-record-chip", toneOf(event.tone || null)); setText(kind, event.kind); meta.appendChild(kind); }
      if (event.actor) { const actor = h("span", "cx-timeline-actor"); setText(actor, event.actor); meta.appendChild(actor); }
      if (event.ref && recordRefValid(event.ref)) recordLink(ctx, { value: event.summary, ref: event.ref }, field, summary); else setText(summary, event.summary);
      main.append(meta, summary);
      if (Array.isArray(event.changes) && event.changes.length) recordChanges(ctx, field, event.changes, main, true);
      item.append(dot, main); list.appendChild(item);
    };
    events.slice(0, limit).forEach(add);
    element.appendChild(list);
    if (events.length > limit) {
      const more = recordButton(fill(ctx.labels.recordShowAll, { count: recordCount(ctx, events.length) }), () => {
        more.remove(); events.slice(limit).forEach(add); list.querySelectorAll(".cx-timeline-item")[limit]?.querySelector("button")?.focus();
      }, "cx-record-more");
      element.appendChild(more);
    }
  }

  // Lists diff by their item text: before marks the removed items, after the added ones.
  function recordTokens(ctx, field, items, other, cell, mark, word) {
    const keys = new Set(other.map(item => cellText(item, field, ctx.fmt))), box = h("span", "cx-record-chips");
    for (const item of items) {
      const chip = recordChip(ctx, field, item), changed = !keys.has(cellText(item, field, ctx.fmt));
      if (changed) { chip.classList.add(mark); const note = h("span", "cx-sr-only"); setText(note, word + ": "); chip.prepend(note); }
      box.appendChild(chip);
    }
    cell.appendChild(box);
  }
  function recordChanges(ctx, field, changes, element, compact) {
    const table = h("table", "cx-record-diff" + (compact ? " cx-record-diff-compact" : "")), caption = h("caption", "cx-sr-only"), head = h("tr"), body = h("tbody"), labels = ctx.labels;
    setText(caption, fill(labels.recordChanged, { count: recordCount(ctx, changes.length) }));
    for (const text of [labels.recordField, labels.recordBefore, labels.recordAfter]) { const cell = h("th"); cell.scope = "col"; setText(cell, text); head.appendChild(cell); }
    for (const change of changes) {
      if (!change || !recordText(change.name, 4096)) recordFail("a change names its field.");
      const line = h("tr"), name = h("th"), before = h("td", "cx-diff-before"), after = h("td", "cx-diff-after"), spec = { id: field.id, title: change.name, kind: change.kind || "text", nested: true };
      name.scope = "row"; setText(name, change.name);
      if (recordKind(change.before) === "items" && recordKind(change.after) === "items") {
        recordTokens(ctx, spec, change.before.items, change.after.items, before, "cx-diff-removed", labels.recordRemoved);
        recordTokens(ctx, spec, change.after.items, change.before.items, after, "cx-diff-added", labels.recordAdded);
      } else {
        // Keep scalar references, tones, tooltips and badges on the ordinary nested-value path. Only its endpoint text differs.
        const paint = (value, element) => recordValue(ctx, spec, recordKind(value) ? value :
          { ...(isCellObject(value) ? value : { value }), text: changeCellText(value, spec, ctx.fmt) }, element, 1);
        paint(change.before, before); paint(change.after, after);
      }
      line.append(name, before, after); body.appendChild(line);
    }
    const thead = h("thead"); thead.appendChild(head);
    table.append(caption, thead, body); element.appendChild(table);
  }
