  // ---------- search highlighting: what to mark (docs/search-highlight.md) ----------
  // Terms come from the accepted query of a flat grid (its search text and its column filters) or from a tree's search box.
  // Text is folded unit by unit, so a hit's positions are the text's own: without matchCase it uses the search's own case
  // folding (foldText), with ignoreAccents a letter with combining accents counts as its base letter.
  const HL_ASCII = /^[\x00-\x7f]*$/, HL_MARKS = /[\u0300-\u036f]/, HL_SEPARATOR = /[\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]/;
  const HL_BASE = new Map(Object.entries({ "\u0142": "l", "\u0141": "L", "\u0111": "d", "\u0110": "D", "\u00f8": "o", "\u00d8": "O", "\u0127": "h", "\u0126": "H", "\u0167": "t", "\u0166": "T", "\u0131": "i" }));
  function hlBase(unit) {
    let base = HL_BASE.get(unit);
    if (base === undefined) {
      const parts = unit.normalize("NFD");
      base = parts.length > 1 && /^[\u0300-\u036f]+$/.test(parts.slice(1)) ? parts.charAt(0) : unit;
      HL_BASE.set(unit, base);
    }
    return base;
  }
  function hlFold(text, options) {
    let value = String(text);
    if (HL_ASCII.test(value)) return options.matchCase ? value : value.toLowerCase();
    if (options.ignoreAccents) {
      let out = "";
      for (let i = 0; i < value.length; i++) { const unit = value.charAt(i); out += unit.charCodeAt(0) < 0xc0 ? unit : hlBase(unit); }
      value = out;
    }
    return options.matchCase ? value : foldText(value);
  }
  // A term is folded like the text (precomposed letters by hlBase), without combining accents typed on their own.
  function hlTermText(text, options) {
    return hlFold(options.ignoreAccents ? String(text).replace(/[\u0300-\u036f]/g, "") : text, options);
  }
  // Search words as the grid's search reads them: the whole text in substring mode, words and quoted phrases in words mode.
  function hlSearchWords(text, mode) {
    if (!text) return [];
    if (mode !== "words") return [text];
    return [...text.matchAll(/"([^"]*)(?:"|$)|([^\s"]+)/g)].map(match => match[1] === undefined ? match[2] : match[1]).filter(Boolean);
  }
  function hlPredicates(group) {
    return group ? [...group.filters, ...group.groups.flatMap(hlPredicates)] : [];
  }

  /**
   * Compiles the terms of a view: { terms, wholes, key }. A term is { text, kind, columns, start, word, tone }: kind is search
   * or filter, columns null or the ids it marks, start a starts-with filter, word a tree's word-prefix search. A whole is a
   * value condition (equal, any of, greater or less) that marks the whole cell of its column when the row meets it.
   */
  function hlCompile(view) {
    const options = view.highlightOptions, terms = [], wholes = [], grid = view.kind === "grid", seen = new Set();
    const add = (raw, kind, columns, start, word, tone) => {
      const text = hlTermText(raw, options), key = kind + "|" + (columns ? [...columns].join(",") : "") + "|" + (start ? 1 : 0) + "|" + text;
      if (text.trim().length < options.minLength || seen.has(key)) return;
      seen.add(key); terms.push({ text, kind, columns, start, word, tone });
    };
    if (view.highlightOn && options.search) {
      if (grid) {
        const query = view.acceptedQuery, scope = view.view.searchColumns ? new Set(view.view.searchColumns) : null;
        if (query) for (const word of hlSearchWords(query.search, query.searchMode)) add(word, "search", scope, false, false);
      } else if (view.searchInput) {
        for (const word of view.searchInput.value.split(HL_SEPARATOR)) if (word) add(word, "search", null, false, true);
      }
    }
    if (view.highlightOn && options.filters && grid && view.acceptedQuery) {
      const query = view.acceptedQuery;
      for (const predicate of [...query.filters, ...hlPredicates(query.filterGroup)]) {
        const column = view.columns.find(item => item.id === predicate.column), tone = options.filterTones[predicate.column] || null;
        if (!column) continue;
        if (predicate.operator === "contains" || predicate.operator === "startsWith")
          add(predicate.values[0], "filter", new Set([column.id]), predicate.operator === "startsWith", false, tone);
        else if (["eq", "in", "gt", "ge", "lt", "le"].includes(predicate.operator)) wholes.push({ predicate, column, tone });
      }
    }
    // Longer terms first, filters before search at the same length: the first term found at a position is the one marked.
    terms.sort((a, b) => b.text.length - a.text.length || (a.kind === b.kind ? 0 : a.kind === "filter" ? -1 : 1));
    return { terms, wholes, key: JSON.stringify([terms.map(term => [term.text, term.kind, term.columns && [...term.columns], term.start]), wholes.map(whole => whole.predicate)]) };
  }

  // The terms that apply to one column, or null when nothing marks it.
  function hlColumnTerms(compiled, column) {
    const terms = compiled.terms.filter(term => !term.columns || term.columns.has(column.id)), wholes = compiled.wholes.filter(whole => whole.column.id === column.id);
    return terms.length || wholes.length ? { terms, wholes } : null;
  }

  /** Finds the hits of the terms in folded text, appending [start, end, term] triples; non-overlapping, earliest first. */
  function hlRanges(folded, terms, out) {
    let at = 0;
    for (;;) {
      let best = null, bestAt = -1;
      for (const term of terms) {
        let index = term.start ? at === 0 && folded.startsWith(term.text) ? 0 : -1 : folded.indexOf(term.text, at);
        // A tree search word matches the start of a word.
        while (term.word && index > 0 && !HL_SEPARATOR.test(folded.charAt(index - 1))) index = folded.indexOf(term.text, index + 1);
        if (index >= 0 && (bestAt < 0 || index < bestAt)) { best = term; bestAt = index; }
      }
      if (!best) return out;
      out.push(bestAt, bestAt + best.text.length, best);
      at = bestAt + Math.max(1, best.text.length);
    }
  }
  // The hits in one cell's text: substring hits, plus one whole-cell hit when a value condition holds for the row.
  function hlCount(text, applicable, options, record) {
    if (!text) return 0;
    for (const whole of applicable.wholes) if (hlWhole(whole, record)) return 1;
    return applicable.terms.length ? hlRanges(hlFold(text, options), applicable.terms, []).length / 3 : 0;
  }
  function hlWhole(whole, record) {
    try { return !!record?.cells && VIEW_MODES.gridMatches(record, whole.predicate, whole.column); } catch (_) { return false; }
  }
