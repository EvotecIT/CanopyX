  // ---------- forms: the lookup editor, a combobox that searches as the reader types ----------
  // context.lookup(text, signal) answers [{ value, label }]: the host's editing.lookups function for the column, else the
  // editor's own options, else the values of the lookup column (inline rows, or the data source's facet search). The list
  // is a popover, so the cell's clipping never cuts it; Up and Down move through it, Enter picks and Escape closes it.
  function editLookupEditor(context) {
    const input = editInput(context), popup = h("div", "cx-editor-list"), note = h("div", "cx-editor-note"), list = h("div"), id = context.id + "-list", labels = context.labels;
    input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false"); input.setAttribute("aria-controls", id);
    list.id = id; list.setAttribute("role", "listbox"); list.setAttribute("aria-label", context.column.title); popup.popover = "manual";
    popup.append(note, list);
    // Pressing anywhere in the list (an option, its scroll bar, the note) keeps focus in the editor.
    popup.addEventListener("pointerdown", event => event.preventDefault());
    let options = [], active = -1, timer = 0, request = null;
    let chosen = context.initial !== undefined || context.value == null ? null : { value: context.value, label: context.text || String(context.value) };
    input.value = context.initial ?? (chosen ? chosen.label : "");
    const paint = () => {
      [...list.querySelectorAll("[role=option]")].forEach((option, index) => option.setAttribute("aria-selected", String(index === active)));
      if (active >= 0) { input.setAttribute("aria-activedescendant", id + "-" + active); list.querySelector("#" + CSS.escape(id + "-" + active))?.scrollIntoView({ block: "nearest" }); }
      else input.removeAttribute("aria-activedescendant");
    };
    const close = () => {
      clearTimeout(timer); request?.abort();
      input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant");
      if (popup.matches(":popover-open")) popup.hidePopover();
    };
    input.addEventListener("blur", close);
    const show = (items, message) => {
      options = items; active = items.length ? 0 : -1; list.replaceChildren(); list.hidden = !items.length;
      setText(note, message || ""); note.hidden = !message;
      items.forEach((item, index) => {
        const option = h("div", "cx-editor-option"); option.id = id + "-" + index; option.setAttribute("role", "option"); setText(option, item.label);
        option.addEventListener("click", () => pick(index));
        list.appendChild(option);
      });
      if (!input.isConnected) return;
      const box = input.getBoundingClientRect();
      popup.style.left = box.left + "px"; popup.style.top = box.bottom + 2 + "px"; popup.style.minWidth = box.width + "px";
      if (!popup.matches(":popover-open")) popup.showPopover();
      input.setAttribute("aria-expanded", "true"); paint();
    };
    const pick = index => { if (context.readOnly) return; chosen = options[index]; input.value = chosen.label; context.remember(chosen); close(); };
    const search = () => {
      if (context.readOnly) return;
      clearTimeout(timer); request?.abort();
      const text = input.value;
      if (text.length < context.lookupMinLength) { close(); return; }
      show([], labels.gridEditSearching);
      timer = setTimeout(() => {
        const controller = request = new AbortController();
        Promise.resolve(context.lookup(text, controller.signal)).then(items => {
          if (!controller.signal.aborted) show(items, items.length ? null : labels.gridEditNoMatches);
        }, error => { if (!controller.signal.aborted && error?.name !== "AbortError") show([], error?.message || String(error)); });
      }, 200);
    };
    input.addEventListener("input", () => { chosen = null; search(); });
    input.addEventListener("keydown", event => {
      const open = input.getAttribute("aria-expanded") === "true";
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!open) search();
        else if (options.length) { active = Math.max(0, Math.min(options.length - 1, active + (event.key === "ArrowDown" ? 1 : -1))); paint(); }
        event.preventDefault();
      } else if (event.key === "Enter" && open && active >= 0) { pick(active); event.preventDefault(); }
      else if (event.key === "Escape" && open) { close(); event.preventDefault(); event.stopPropagation(); }
    });
    const typed = () => {
      const text = foldText(input.value.trim());
      return options.find(option => foldText(option.label) === text) || (chosen && foldText(chosen.label) === text ? chosen : null);
    };
    const element = h("span", "cx-editor-combo");
    element.append(input, popup);
    if (typeof context.initial === "string") queueMicrotask(search);
    return { element, control: input,
      getValue: () => !input.value.trim() ? null : (chosen || typed())?.value ?? null,
      error: () => input.value.trim() && !chosen && !typed() ? fill(labels.gridEditChoice, { column: context.column.title }) : null,
      destroy() { clearTimeout(timer); request?.abort(); close(); popup.remove(); } };
  }
