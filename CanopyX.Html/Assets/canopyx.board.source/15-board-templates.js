  // Visual dimensions are consumed by the virtual layout; event wiring stays in render.
  function boardMeasureTemplate(frame) {
    const card = h("article", "cx-board-card"), group = h("h4", "cx-board-swimlane");
    for (const probe of [card, group]) { probe.style.visibility = "hidden"; probe.setAttribute("aria-hidden", "true"); }
    frame.append(card, group);
    const cardHeight = card.getBoundingClientRect().height + Number.parseFloat(getComputedStyle(card).marginBottom);
    const groupHeight = group.getBoundingClientRect().height;
    card.remove(); group.remove();
    return { cardHeight, groupHeight };
  }
  function boardToolsTemplate(board) {
      const toolbar = h("div", "cx-board-tools"), label = h("label"), picker = h("select", "cx-select cx-board-picker");
      label.htmlFor = this.id + "-board-lane"; picker.id = label.htmlFor; setText(label, board.labels.boardLane);
      for (const lane of board.lanes) { const option = h("option"); option.value = lane.key; setText(option, lane.label + " (" + lane.rows.length + ")"); picker.appendChild(option); }
      picker.value = board.lane || "";
      const help = h("p", "cx-board-help"); help.id = this.id + "-board-help"; setText(help, board.labels.boardKeys);
      toolbar.append(label, picker); this.boardFrame.append(toolbar, help);
      if (board.partial) { const warning = h("p", "cx-board-warning"); warning.setAttribute("role", "status"); setText(warning, fill(board.labels.boardPartial, { count: board.rows.length })); this.boardFrame.appendChild(warning); }
      return picker;
  }
  function boardLaneTemplate(board, lane, lanes) {
        const section = h("section", "cx-board-lane"), header = h("header", "cx-board-heading"), title = h("h3"), count = h("span", "cx-board-count");
        section.dataset.lane = lane.key; title.id = this.id + "-lane-" + board.lanes.indexOf(lane); setText(title, lane.label); section.setAttribute("aria-labelledby", title.id);
        setText(count, lane.wipLimit ? fill(board.labels.boardWip, { count: lane.count, limit: lane.wipLimit }) : String(lane.rows.length));
        count.title = lane.wipLimit ? fill(board.labels.boardWipFull, { lane: lane.label, limit: lane.wipLimit }) : lane.label;
        section.classList.toggle("cx-board-full", !!lane.wipLimit && lane.count >= lane.wipLimit); header.append(title, count); section.appendChild(header);
        const scroll = h("div", "cx-board-scroll"), canvas = h("div", "cx-board-canvas"); scroll.dataset.lane = lane.key;
        scroll.tabIndex = 0; scroll.setAttribute("aria-label", lane.label); scroll.appendChild(canvas); section.appendChild(scroll); lanes.appendChild(section);
        return { section, scroll, canvas };
  }
  function boardCardTemplate(row, text, fields) {
      const card = h("article", "cx-board-card"), title = h("button", "cx-btn ghost cx-board-title");
      card.dataset.cxBoardRecord = row.id; card.tabIndex = 0;
      card.setAttribute("aria-label", text); card.setAttribute("aria-describedby", this.id + "-board-help"); title.type = "button"; setText(title, text); title.title = text;
      card.appendChild(title);
      const details = h("dl", "cx-board-fields");
      for (const field of fields) { const key = h("dt"), value = h("dd"), text = field.text; setText(key, field.title); setText(value, text); value.title = text; details.append(key, value); }
      card.appendChild(details);
      return { card, title };
  }
  function boardMoveTemplate(label, options, value, disabled, card) {
        const move = h("select", "cx-select cx-board-move"); move.setAttribute("aria-label", label);
        for (const target of options) { const option = h("option"); option.value = target.key; option.disabled = target.disabled; setText(option, target.label); move.appendChild(option); }
        move.value = value; move.disabled = disabled; card.appendChild(move);
        return move;
  }
