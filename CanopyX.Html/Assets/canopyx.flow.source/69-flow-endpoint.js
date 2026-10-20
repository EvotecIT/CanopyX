  // ---------- flow: an endpoint answers the hooks (docs/flow.md#an-endpoint-mapcanopyflow) ----------
  // A document with endpoint { url, routes } (CanopyX.AspNetCore's MapCanopyFlow writes the routes it maps) needs no script:
  // each route the host left without a hook of its own becomes one, posting JSON to <url>/<route> on the page's own origin
  // with the page's cookies and the host's headers (an antiforgery token, for example). The server re-validates everything
  // it receives; secrets travel only to check and submit, and only those the check or the proposal names.
  function flowEndpointHooks(model, hooks, headers) {
    const endpoint = model.endpoint, has = route => endpoint.routes.includes(route), merged = Object.assign({}, hooks);
    const request = async (method, route, body, signal) => {
      const response = await fetch(endpoint.url + "/" + route, { method, credentials: "same-origin", signal, cache: "no-store",
        headers: Object.assign(body === undefined ? {} : { "Content-Type": "application/json" }, { Accept: "application/json" }, headers),
        body: body === undefined ? undefined : JSON.stringify(Object.assign({ flow: model.id }, body)) });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
      // The server's typed client errors carry a message for the reader; anything else says only that the request failed.
      if (!response.ok) throw new Error(data && typeof data.message === "string" ? data.message : "The server answered " + response.status + ".");
      return data;
    };
    const post = (route, body, signal) => request("POST", route, body, signal);
    const secretsOf = (ids, read) => { const secrets = {}; for (const id of ids) { const value = read(id); if (typeof value === "string" && value) secrets[id] = value; } return secrets; };
    if (has("options") && !hooks.options) merged.options = (field, values, { signal }) => post("options", { field, values }, signal).then(data => data?.options);
    if (has("fields") && !hooks.fields) merged.fields = (section, values, { signal }) => post("fields", { section, values }, signal).then(data => data?.fields);
    if (has("check") && !hooks.check) merged.check = (check, values, { signal, secret }) => post("check", { check, values, secrets: secretsOf(model.checks.get(check)?.fields || [], secret) }, signal);
    if (has("validate")) {
      if (!hooks.validateStep) merged.validateStep = (step, values) => post("validate", { step, values });
      if (!hooks.validateFlow) merged.validateFlow = values => post("validate", { values });
    }
    if (has("preview") && !hooks.preview) merged.preview = (values, { signal }) => post("preview", { values }, signal);
    if (has("status") && !hooks.status) merged.status = (values, { signal }) => post("status", { values }, signal);
    if (has("draft") && !hooks.draftStore) merged.draftStore = {
      load: () => request("GET", "draft"), save: (id, draft) => request("PUT", "draft", { draft }), clear: () => request("DELETE", "draft")
    };
    if (has("submit") && !hooks.submit) merged.submit = detail => {
      const submission = JSON.parse(JSON.stringify(detail)), ids = Object.keys(submission.secrets || {}).filter(id => submission.secrets[id].state === "set");
      return post("submit", { submission, secrets: secretsOf(ids, detail.secret) });
    };
    return merged;
  }
