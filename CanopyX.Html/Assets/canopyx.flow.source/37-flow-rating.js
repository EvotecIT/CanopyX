  // ---------- flow: rating fields, stars over native radio buttons (docs/flow.md#fields) ----------
  // The arrow keys and the group's name come from the radio group; the stars fill up to the chosen one. An optional field goes
  // back to no answer when the reader chooses its value again or presses Delete; a required one keeps its answer.
  function flowRatingInput(context, field, labels) {
    const group = h("div", "cx-flow-rating"), scale = field.scale, inputs = [];
    group.setAttribute("role", "radiogroup");
    let value = Number.isInteger(context.value) ? context.value : null, pressed = null;
    for (let step = 1; step <= scale; step++) {
      const item = h("label", "cx-flow-star"), input = h("input"), text = h("span", "cx-sr-only");
      input.type = "radio"; input.name = context.id; input.value = String(step); input.checked = step === value; input.disabled = context.readOnly;
      setText(text, fill(labels.flowRatingValue, { value: step, max: scale }));
      item.append(input, text); group.appendChild(item); inputs.push(input);
    }
    const paint = () => inputs.forEach((input, at) => input.parentElement.classList.toggle("cx-flow-star-on", value !== null && at < value));
    const clear = () => { value = null; inputs.forEach(input => { input.checked = false; }); paint(); group.dispatchEvent(new Event("change", { bubbles: true })); };
    group.addEventListener("pointerdown", event => { const input = event.target.closest("label")?.querySelector("input"); pressed = input && input.checked ? input : null; });
    group.addEventListener("click", event => {
      if (!inputs.includes(event.target)) return;
      // The click finishes as usual, then the clear unchecks the star; cancelling it would check the radio again.
      if (pressed === event.target && !field.required) { pressed = null; clear(); return; }
      pressed = null;
    });
    group.addEventListener("change", event => { if (inputs.includes(event.target)) { value = Number(event.target.value); paint(); } });
    group.addEventListener("keydown", event => { if ((event.key === "Delete" || event.key === "Backspace") && !field.required && !context.readOnly && inputs.includes(event.target)) { event.preventDefault(); clear(); event.target.focus(); } });
    paint();
    return { element: group, control: group, group: true, focus: () => (inputs.find(input => input.checked) || inputs[0]).focus(), getValue: () => value };
  }
