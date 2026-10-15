
  // ---------- tree grid: deep links come with the links part ----------
  // With deepLink on the view, the selected row is written to the URL fragment, and a fragment expands its row on load
  // and whenever it changes (canopyx.links.source). A view with deepLink starts loading the part when it is created; until
  // the part is installed these methods load it and run again, and a part that cannot load is reported as an error.
  // A view without deepLink never loads it.
  const LINKS = definePart(TreeGrid, "links", "deep links", () => ({ TreeGrid, navigationScope }));
  for (const name of ["openDeepLink", "writeDeepLink"]) TreeGrid.prototype[name] = function (...args) {
    return this.view.deepLink ? loadPart(LINKS).then(() => this[name](...args), error => this.emit("error", { error })) : Promise.resolve();
  };
  /**
   * Reads the address again and opens the row its fragment names, as when the fragment changes. While the view is
   * still loading, the fragment is opened once it has loaded. Resolves when the row is open or the fragment names none,
   * also when that fragment was already being opened; a call whose fragment a newer one replaces settles without it.
   * A fragment is only being opened (linkOpening) once the part is installed.
   */
  TreeGrid.prototype.readLocation = function () {
    if (this.destroyed) return Promise.resolve();
    if (this.initializing) {
      if (this.linkOpening && this.currentLink() !== this.link) {
        this.linkOpening.abort();
        this.link = null; // Deferred reopening must not reuse the canceled link if the address changes back.
      }
      this.linkChanged = this.dataLifetime.signal;
      return this.ready.then(() => undefined, () => undefined);
    }
    return this.openDeepLink();
  };