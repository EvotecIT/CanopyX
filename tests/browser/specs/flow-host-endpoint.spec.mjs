// An endpoint answers the hooks (docs/flow.md#an-endpoint): a document with endpoint { url, routes } posts JSON to
// <url>/<route> on the page's own origin with the host's headers, sends a secret only to a check that tests it and to submit,
// and shows the server's typed error messages. The page is served over http so its requests can be answered here.
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { exampleUrl } from "./support.mjs";
import { field, next, stepTitle, waitForFlow } from "./flow-support.mjs";

const ORIGIN = "http://flows.canopyx.test";
const DOC = {
  kind: "flow", version: 1, id: "relay", title: "Relay", draft: "host",
  endpoint: { url: "/api/flows/relay", routes: ["options", "check", "validate", "preview", "draft", "submit"] },
  steps: [
    { id: "server", title: "Server", fields: [
      { id: "host", type: "text", label: "Host", required: true },
      { id: "password", type: "secret", label: "Password" },
      { id: "region", type: "select", label: "Region", source: "host" }
    ], checks: [{ id: "connect", label: "Test the connection", fields: ["host", "password"] }] },
    { id: "review", type: "review" }
  ]
};

/** Serves the flow page over http, answers the endpoint's routes with answer(route, method, body), and mounts the document. */
async function mount(page, answer) {
  const html = fs.readFileSync(new URL(exampleUrl("flow-workbench.html")), "utf8");
  const requests = [];
  await page.route(ORIGIN + "/page.html", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.route(ORIGIN + "/api/flows/relay/*", async route => {
    const request = route.request(), name = new URL(request.url()).pathname.split("/").pop(), body = request.postData() ? JSON.parse(request.postData()) : null;
    requests.push({ route: name, method: request.method(), body, csrf: request.headers()["x-csrf"] ?? null, type: request.headers()["content-type"] ?? null });
    const [status, json] = await answer(name, request.method(), body);
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
  });
  await page.goto(ORIGIN + "/page.html");
  await waitForFlow(page);
  await page.evaluate(doc => {
    const old = document.querySelector("[data-canopyx-host]");
    old.canopyx.destroy(); old.remove();
    const host = document.createElement("div");
    host.setAttribute("data-canopyx-host", "");
    // The page's own mock host stays out of it: the endpoint answers the proposal.
    host.addEventListener("canopyx:flowSubmit", event => event.stopPropagation());
    document.querySelector(".cx-main").prepend(host);
    window.CanopyX.createFlow(host, { flow: doc, headers: { "X-CSRF": "token-1" } });
  }, DOC);
  await waitForFlow(page);
  return requests;
}

const ok = route => {
  switch (route) {
    case "options": return [200, { options: [{ value: "eu", label: "Europe" }] }];
    case "check": return [200, { status: "pass", message: "Connected." }];
    case "validate": return [200, {}];
    case "preview": return [200, { rows: [{ label: "Applies", value: "At once" }] }];
    case "draft": return [200, null];
    default: return [200, { status: "saved", message: "Saved on the server." }];
  }
};

test("each hook posts its request to its route with the host's headers, and secrets travel only where they are tested", async ({ page }) => {
  const requests = await mount(page, ok);
  await expect(field(page, "region").locator("option", { hasText: "Europe" })).toHaveCount(1);
  await field(page, "host").locator("input").fill("smtp.example.com");
  await field(page, "password").locator("input").fill("Endpoint-secret-9");
  await page.getByRole("button", { name: "Test the connection" }).click();
  await expect(page.locator(".cx-flow-check-item")).toHaveAttribute("data-cx-state", "pass");
  await next(page);
  await expect(stepTitle(page)).toHaveText("Check your answers");
  await expect(page.locator(".cx-flow-preview")).toContainText("At once");
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await expect(page.locator(".cx-flow-result")).toContainText("Saved on the server.");

  const routes = requests.map(request => request.method + " " + request.route);
  expect(routes).toEqual(expect.arrayContaining(["GET draft", "POST options", "POST check", "POST validate", "POST preview", "POST submit"]));
  for (const request of requests) {
    expect(request.csrf).toBe("token-1");
    if (request.method === "POST") { expect(request.type).toContain("application/json"); expect(request.body.flow).toBe("relay"); }
  }
  const check = requests.find(request => request.route === "check");
  expect(check.body).toMatchObject({ check: "connect", values: { host: "smtp.example.com" }, secrets: { password: "Endpoint-secret-9" } });
  const submit = requests.find(request => request.route === "submit");
  expect(submit.body.secrets).toEqual({ password: "Endpoint-secret-9" });
  expect(JSON.stringify(submit.body.submission)).not.toContain("Endpoint-secret-9");
  expect(submit.body.submission.secrets).toEqual({ password: { state: "set" } });
  for (const request of requests.filter(request => !["check", "submit"].includes(request.route))) expect(JSON.stringify(request.body)).not.toContain("Endpoint-secret-9");
});

test("the server's typed errors show in place, and its field messages beside the fields", async ({ page }) => {
  await mount(page, (route, method) => {
    if (route === "validate") return [200, { fieldErrors: { host: "That server is already used." } }];
    if (route === "submit") return [400, { error: "invalidDocument", message: "The proposal names another flow." }];
    if (route === "check") return [500, { error: "serverError", message: "The request could not be completed." }];
    return ok(route, method);
  });
  await field(page, "host").locator("input").fill("taken.example.com");
  await page.getByRole("button", { name: "Test the connection" }).click();
  await expect(page.locator(".cx-flow-check-item")).toHaveAttribute("data-cx-state", "fail");
  await expect(page.locator(".cx-flow-check-message")).toHaveText("The request could not be completed.");
  await next(page);
  await expect(field(page, "host").locator(".cx-flow-error")).toHaveText("That server is already used.");
  await expect(stepTitle(page)).toHaveText("Server");
});

test("a submit the server refuses shows its message, and a draft saves through PUT", async ({ page }) => {
  const requests = await mount(page, (route, method) => route === "submit" ? [400, { error: "invalidDocument", message: "The proposal names another flow." }] : ok(route, method));
  await field(page, "host").locator("input").fill("smtp.example.com");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.locator(".cx-flow-draft-note")).toHaveText("Draft saved");
  const put = requests.find(request => request.method === "PUT");
  expect(put.body).toMatchObject({ flow: "relay", draft: { kind: "flowDraft", flow: "relay", values: { host: "smtp.example.com" } } });
  await next(page);
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await expect(page.locator(".cx-flow-answer-banner")).toContainText("The proposal names another flow.");
});
