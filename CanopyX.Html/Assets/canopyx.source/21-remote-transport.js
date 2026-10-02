
  // ---------- bounded remote transport ----------
  /** Keeps the deadline and caller signals attached until the response body has been read, then releases them. */
  async function remoteJson(url, type, timeoutMs, lifetime, signal) {
    const controller = new AbortController();
    const signals = Array.from(new Set([lifetime, signal].filter(Boolean)));
    const abort = () => controller.abort();
    signals.forEach((item) => {
      if (item.aborted) abort();
      else item.addEventListener("abort", abort, { once: true });
    });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) {
        // Some transports keep draining an unread HTTP error after abort; cancel its body before retiring ownership.
        if (response.body) await response.body.cancel().catch(() => {});
        throw new Error(response.status + " " + response.statusText);
      }
      return checkDocument(await response.json(), type);
    } catch (error) {
      if (timedOut) throw new Error("CanopyX: remote request timed out after " + timeoutMs + " milliseconds.");
      throw error;
    } finally {
      // Retiring a request also closes an unread error body; releasing listeners alone leaves its stream alive.
      abort();
      clearTimeout(timer);
      signals.forEach((item) => item.removeEventListener("abort", abort));
    }
  }
