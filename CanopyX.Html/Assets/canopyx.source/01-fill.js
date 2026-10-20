  // ---------- label text: placeholders and plural forms ----------
  // Every entry point fills label templates the same way; the flow entry point uses these without the tree labels.
  /** A label with its {placeholders} replaced; a placeholder without a value stays as it is. */
  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, name) => (values && Object.hasOwn(values, name) ? String(values[name]) : match));
  }

  // A label can hold plural forms, "[one]{count} match[other]{count} matches", one per category of the page language's plural
  // rules (zero, one, two, few, many, other); plural picks the form for a count, "other" when the language has no form of its own.
  const pluralRules = new Map();
  function plural(template, count, lang) {
    if (!template.startsWith("[")) return template;
    const forms = {};
    for (const match of template.matchAll(/\[(zero|one|two|few|many|other)\]([^[]*)/g)) forms[match[1]] = match[2];
    let rules = pluralRules.get(lang);
    if (!rules) { try { rules = new Intl.PluralRules(lang || "en"); } catch (_) { rules = new Intl.PluralRules("en"); } pluralRules.set(lang, rules); }
    return forms[rules.select(Number(count))] ?? forms.other ?? template;
  }
