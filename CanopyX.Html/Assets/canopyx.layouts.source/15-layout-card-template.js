  // Safe card templates replace only the content of an existing column slot. The cells, their order, selection chrome
  // and labels remain native. Neither the template nor a substituted cell value is ever parsed as HTML.
  function cardTemplateSlot(view, row, column, slot) {
    const templates = view.view.cardTemplate;
    if (!templates || !Object.hasOwn(templates, column.id)) return;
    const text = templates[column.id].replace(/\{([^{}]+)\}/g, (_, id) => {
      const definition = view.columns.find(item => item.id === id);
      return cellText(row.h.cells[id], definition, view.fmt);
    });
    slot.cell.classList.add("cx-card-templated");
    const content = slot.cardTemplateContent ||= h("span", "cx-card-slot");
    // Phone composition may have moved the previous paint's content into its primary line. Reuse that same span rather
    // than accumulating a new hidden template every time a virtual row is repainted; keep the real checkbox reachable.
    if (content.parentNode !== slot.cell) slot.cell.appendChild(content);
    const check = slot.cell.querySelector(".cx-grid-row-select");
    if (check && check.parentNode !== slot.cell) slot.cell.prepend(check);
    setText(content, text); content.title = text;
  }
