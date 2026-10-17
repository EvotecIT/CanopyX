
  // ---------- sidecar registry ----------
  // Sidecar files run (self.CanopyXSidecar = self.CanopyXSidecar || []).push([viewId, ref, document]). Files that ran
  // before the runtime left entries in a plain array; the runtime drains it and replaces push, so load order does not
  // matter. Script tags are used because browsers block fetch() of local files on file://.
  const sidecarDocs = new Map();
  const sidecarWaiters = new Map();

  function sidecarKey(view, ref) {
    return JSON.stringify([view, ref]);
  }

  function acceptSidecar(entry) {
    if (!Array.isArray(entry) || entry.length !== 3) {
      return;
    }
    const key = sidecarKey(entry[0], entry[1]);
    const waiter = sidecarWaiters.get(key);
    if (waiter) {
      sidecarWaiters.delete(key);
      waiter.resolve(entry[2]);
    } else {
      sidecarDocs.set(key, entry[2]);
    }
  }

  const sidecarQueue = global.CanopyXSidecar = global.CanopyXSidecar || [];
  sidecarQueue.forEach(acceptSidecar);
  sidecarQueue.length = 0;
  sidecarQueue.push = function () {
    for (let i = 0; i < arguments.length; i++) {
      acceptSidecar(arguments[i]);
    }
    return 0;
  };

  /** Loads one sidecar document by injecting its script; resolves with the document the script registers. */
  function loadSidecar(base, view, ref) {
    if (ref.split("/").some((part) => part === "." || part === "..")) {
      return Promise.reject(new Error("Sidecar reference cannot contain a dot path component: " + ref));
    }
    const key = sidecarKey(view, ref);
    if (sidecarDocs.has(key)) {
      const doc = sidecarDocs.get(key);
      sidecarDocs.delete(key);
      return Promise.resolve(doc);
    }
    const pending = sidecarWaiters.get(key);
    if (pending) {
      return pending.promise;
    }
    const waiter = {};
    waiter.promise = new Promise((resolve, reject) => {
      waiter.resolve = resolve;
      waiter.reject = reject;
    });
    sidecarWaiters.set(key, waiter);
    const script = withNonce(document.createElement("script"));
    // A wire reference is an opaque path, not a URL suffix. Encode each component so ? and #
    // remain part of the file name while the separators between bundle folders stay intact.
    script.src = trusted("ScriptURL", base + ref.split("/").map(encodeURIComponent).join("/") + ".js");
    script.async = true;
    script.onload = () => {
      script.remove();
      if (sidecarWaiters.get(key) === waiter) {
        sidecarWaiters.delete(key);
        waiter.reject(new Error("Sidecar file did not register its data: " + ref));
      }
    };
    script.onerror = () => {
      script.remove();
      if (sidecarWaiters.get(key) === waiter) {
        sidecarWaiters.delete(key);
        waiter.reject(new Error("Sidecar file is missing: " + ref));
      }
    };
    document.head.appendChild(script);
    return waiter.promise;
  }
