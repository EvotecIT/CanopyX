  // ---------- number formatting ----------
  // Cells, presenters, exports, selection totals and summaries share one cached formatter per language and digit range.
  const numberFormats = new Map();
  function numberFormat(lang, minimum = 0, maximum = 3) {
    const key = (lang || "") + "|" + minimum + "|" + maximum;
    let format = numberFormats.get(key);
    if (!format) {
      const digits = { minimumFractionDigits: minimum, maximumFractionDigits: maximum };
      try {
        format = new Intl.NumberFormat(lang || undefined, digits);
      } catch (e) {
        format = new Intl.NumberFormat(undefined, digits);
      }
      if (numberFormats.size >= 16) numberFormats.delete(numberFormats.keys().next().value);
      numberFormats.set(key, format);
    }
    return format;
  }

  /** A raw number in a declared format: digits in the reader's language, the prefix after any sign, then the suffix. */
  function numberText(value, lang, format) {
    if (!format) return numberFormat(lang).format(value);
    const minimum = format.minimumFractionDigits ?? 0, maximum = format.maximumFractionDigits ?? 3;
    // Round the binary64 value once. Keep the fixed-point decimal string intact for Intl, and discard a rounded zero's sign.
    // toFixed switches to shortest exponential text at 1e21; these values are integers, so BigInt retains every binary digit.
    const magnitude = Math.abs(value), fixed = magnitude >= 1e21 ? BigInt(magnitude).toString() : magnitude.toFixed(maximum);
    const signed = value < 0 && Number(fixed) !== 0 ? "-" + fixed : fixed;
    const parts = numberFormat(lang, minimum, maximum).formatToParts(signed);
    const at = parts.findIndex(part => !["minusSign", "literal"].includes(part.type));
    return parts.map((part, index) => (index === at && format.prefix || "") + part.value).join("") + (format.suffix || "");
  }
