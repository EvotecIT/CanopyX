import { expect, test } from "@playwright/test";
import path from "node:path";
import { viewPage, nextFrames, repo, searchIndex } from "./support.mjs";
const view = { protocol: "canopyx/2", type: "view", id: "contracts", label: "Contracts", columns: [{ id: "name", title: "Name", width: 600 }], source: { kind: "inline" }, roots: [] };
async function open(page, data, setup = "") {
  await page.route("https://canopyx.test/", r => r.fulfill({ contentType: "text/html", body: viewPage(data).replace("</body>", `<script>${setup}</script></body>`) }));
  await page.goto("https://canopyx.test/#other=keep"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
}
test.beforeEach(({ page }) => { page.errors = []; page.on("pageerror", e => page.errors.push(e.message)); });
test.afterEach(({ page }) => expect(page.errors).toEqual([]));

for (const kind of ["remote", "sidecar"]) for (const mismatch of ["missing", "extra"]) test(`${kind} rejects ${mismatch} continuation for known total`, async ({ page }) => {
  const doc = { protocol: "canopyx/2", type: "page", parent: null, offset: 0, items: [{ id: "first", label: "First" }], total: mismatch === "missing" ? 2 : 1, next: mismatch === "missing" ? null : "more" };
  await page.route("https://canopyx.test/page?*", r => r.fulfill({ json: doc }));
  await page.route("https://canopyx.test/data/**", r => { const key = new URL(r.request().url()).pathname.slice(6, -3); const value = key === "manifest" ? { protocol: "canopyx/2", type: "manifest", view: view.id, root: "r/0" } : doc;
    return r.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify([view.id, key, value])});` }); });
  await open(page, { ...view, roots: undefined, source: kind === "remote" ? { kind, children: "/page?ref={ref}&cursor={cursor}" } : { kind, base: "/data/" } });
  await expect(page.locator('[data-cx-status="error"]')).toContainText("continuation");
  await expect(page.locator('[data-cx-id="first"]')).toHaveCount(0);
});

for (const query of ["\u00a0folder", "folder\u00a0", "\u3000folder", "folder\u3000"]) for (const kind of ["inline", "remote", "sidecar"]) test(`${kind} preserves non-ASCII boundaries in ${JSON.stringify(query)}`, async ({ page }) => {
  const hit = { path: ["found"], label: query }; const search = { protocol: "canopyx/2", type: "search", query, hits: [hit], total: 1, truncated: false };
  const index = searchIndex([hit, { path: ["plain"], label: "folder" }]);
  await page.route("https://canopyx.test/search?*", r => r.fulfill({ json: new URL(r.request().url()).searchParams.get("q") === query ? search : { ...search, hits: [], total: 0 } }));
  await page.route("https://canopyx.test/page?*", r => r.fulfill({ json: { protocol: "canopyx/2", type: "page", parent: null, offset: 0, next: null, items: [{ id: "found", label: query }] } }));
  await page.route("https://canopyx.test/data/**", r => { const key = new URL(r.request().url()).pathname.slice(6, -3); const value = key === "manifest" ? { protocol: "canopyx/2", type: "manifest", view: view.id, root: "r/0", search: index.search } : key === "r/0" ? { protocol: "canopyx/2", type: "page", parent: null, offset: 0, next: null, items: [{ id: "found", label: query }] } : index.docs[key];
    return r.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify([view.id, key, value])});` }); });
  await open(page, { ...view, roots: kind === "inline" ? [{ id: "found", label: query }, { id: "plain", label: "folder" }] : undefined, source: kind === "inline" ? { kind } : kind === "remote" ? { kind, children: "/page?ref={ref}&cursor={cursor}", search: "/search?q={query}&limit={limit}" } : { kind, base: "/data/" }, search: { minLength: 2, maxResults: 20, placeholder: "Search" } });
  const direct = await page.evaluate(async q => (await document.querySelector(".cx-host").canopyx.search(q)).hits.map(h => h.path), query); expect(direct).toEqual([["found"]]);
  await page.getByRole("combobox").fill(query); await expect(page.getByRole("option")).toHaveCount(1); expect(await page.getByRole("option").textContent()).toBe(query);
  if (kind === "sidecar" && query.startsWith("\u3000")) await page.screenshot({ path: path.join(repo, "artifacts/takeover/tenth-search.png") });
});

for (const action of ["Control", "Meta", "Space"]) test(`${action} deselection updates only the grid hash parameter`, async ({ page }) => {
  await open(page, { ...view, selection: "multiple", deepLink: true, roots: [{ id: "one", label: "One" }, { id: "two", label: "Two" }] });
  const one = page.locator('[data-cx-id="one"]'), two = page.locator('[data-cx-id="two"]'); await one.click(); await two.click({ modifiers: ["ControlOrMeta"] });
  const toggle = async row => row.dispatchEvent("click", { ctrlKey: action === "Control", metaKey: action === "Meta" });
  if (action === "Space") { await two.focus(); await two.press("Space"); } else await toggle(two);
  await expect(two).toHaveAttribute("aria-selected", "false"); expect(await page.evaluate(() => location.hash)).toContain("cx.contracts=one");
  if (action === "Space") { await one.focus(); await one.press("Space"); } else await toggle(one);
  expect(await page.evaluate(() => location.hash)).toBe("#other=keep");
  await page.reload(); await page.waitForSelector("[data-cx-ready]"); await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
});

test("the platform's native multi-select modifier retains both selected rows", async ({ page }) => {
  await open(page, { ...view, selection: "multiple", roots: [{ id: "one", label: "One" }, { id: "two", label: "Two" }] });
  await page.locator('[data-cx-id="one"]').click();
  await page.locator('[data-cx-id="two"]').click({ modifiers: ["ControlOrMeta"] });
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(2);
});

test("outline HTML details honor host ownership while default markup remains encoded", async ({ page }) => {
  await open(page, { ...view, roots: [{ id: "owned", label: "Owned", detail: { type: "html", html: "<strong>Raw</strong>" } }, { id: "plain", label: "Plain", detail: { type: "html", html: "<em>Encoded</em>" } }] }, `CanopyX.createTreeGrid(document.querySelector('.cx-host'), { view: JSON.parse(document.querySelector('.cx-config').textContent), renderDetail(node, el) { if (node.id === 'owned') { const strong=document.createElement('strong'); strong.textContent='Host detail'; el.appendChild(strong); return true; } return false; } });`);
  const result = await page.evaluate(() => { const api=document.querySelector('.cx-host').canopyx; const out=document.createElement('div'); out.innerHTML=api.toOutline(); return { strong: out.querySelector('strong')?.textContent, em: out.querySelectorAll('em').length, text: out.textContent }; });
  expect(result.strong).toBe("Host detail"); expect(result.em).toBe(0); expect(result.text).toContain("<em>Encoded</em>");
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await expect(page.locator('.cx-outline strong')).toHaveText('Host detail');
  await page.emulateMedia({ media: "print" }); await expect(page.locator(".cx-outline")).toBeVisible();
  await expect(page.locator(".cx-outline")).toContainText("<em>Encoded</em>");
  await page.screenshot({ path: path.join(repo, "artifacts/takeover/tenth-outline.png") });
});
