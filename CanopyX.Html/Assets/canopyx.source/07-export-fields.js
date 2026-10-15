  // CSV, record exports and clipboard ranges share formula protection and delimiter quoting.
  function gridExportField(value, delimiter, typed = false) {
    if (value == null) return "";
    let text = String(value);
    if (typeof value !== "number" && !typed && /^(?:[\t\r]|\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/.test(text)) text = "'" + text;
    return text.includes(delimiter) || /["\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }
