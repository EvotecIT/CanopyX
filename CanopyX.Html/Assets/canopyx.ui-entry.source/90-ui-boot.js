  // ---------- the UI entry point's API and automatic mount ----------
  global.CanopyX = Object.freeze(Object.assign({ registerPart, setNonce }, UI_API));

  // As the other entry points: wait for DOMContentLoaded unless the page has already been parsed.
  const navigation = global.performance?.getEntriesByType?.("navigation")[0] || global.performance?.timing;
  if (document.readyState === "loading" || (document.readyState === "interactive" && navigation?.domContentLoadedEventStart === 0)) {
    document.addEventListener("DOMContentLoaded", () => mountUi(document));
  } else {
    mountUi(document);
  }
})(typeof window !== "undefined" ? window : this);
