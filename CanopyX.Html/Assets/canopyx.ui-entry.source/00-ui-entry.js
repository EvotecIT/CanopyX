/* CanopyX UI entry: standalone UI primitives. */
/*
 * CanopyX UI entry point: the part loader, the overlay manager's loader and the UI factories, without grid, tree or flow code.
 * The UI parts load beside it on first use. Assembled by Build/Sync-Assets.ps1 from this folder and a few shared core parts; edit the parts.
 */
(function (global) {
  "use strict";

  // One entry point per page; every data view entry point already carries these factories. Keep the first.
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
