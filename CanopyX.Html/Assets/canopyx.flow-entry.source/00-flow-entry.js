/* CanopyX flow entry: forms and guided flows. */
/*
 * CanopyX flow entry point: mounts flow documents (docs/flow.md) without grid or tree code. The forms and flow parts load
 * beside it on first use. Assembled by Build/Sync-Assets.ps1 from this folder and a few shared core parts; edit the parts.
 */
(function (global) {
  "use strict";

  // One entry point per page. A grid entry point already on the page creates flows itself; keep the first.
  if (global.CanopyX) {
    return;
  }

  /** Creates an element with an optional class name. */
  function h(tag, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    return element;
  }

  /** Sets text safely; every host string goes through textContent, never innerHTML. */
  function setText(element, value) {
    element.textContent = value == null ? "" : String(value);
  }

  // Plugins of this page: the flow entry point reads their editors (docs/plugins.md, docs/flow.md#fields).
  const PLUGINS = new Map();
