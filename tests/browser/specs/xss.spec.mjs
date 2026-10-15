// Host strings are text (docs/security.md): labels, cell values, column titles, badges, tooltips, filter and search labels,
// detail tables and properties, the record drawer, the print outline and exports never become markup, link presenters only
// link to http, https, mailto and plain file addresses, CSV and clipboard fields cannot start a spreadsheet formula, and
// export file names are basenames. Markup the host declares trusted (html details, view icons) goes through sanitizeHtml.
import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

// Every way a string could turn into script if it were parsed as markup.
const X = `<img src=x onerror="window.__xss=(window.__xss||0)+1"><script>window.__xss=(window.__xss||0)+1</script>"'><svg onload="window.__xss=(window.__xss||0)+1"></svg>&amp;`;

async function open(page, view, script = "", size = { width: 1280, height: 800 }) {
  await page.setViewportSize(size);
  const html = viewPage(view).replace("</head>", (script ? "<script>" + script + "</script>" : "") + "</head>");
  await page.route("http://canopyx.test/xss", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/xss");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

/** No element came from a host string: no injected img, script or svg[onload], and no handler ran. */
async function expectInert(page) {
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator(".cx-host img, .cx-host svg[onload], .cx-host script:not([type]), .cx-grid-overlay img, .cx-drawer img").count()).toBe(0);
  expect(await page.evaluate(() => [...document.querySelectorAll("*")].some(element => [...element.attributes].some(attribute => /^on/i.test(attribute.name))))).toBe(false);
}

const treeView = () => ({ protocol: "canopyx/2", type: "view", id: "xss-tree", label: X, rowHeight: 28, pageSize: 100, selection: "multiple",
  search: { placeholder: X }, source: { kind: "inline" },
  columns: [{ id: "name", title: X, kind: "text", width: 320, sortable: true }, { id: "owner", title: X, kind: "text", width: 240 }],
  filters: [{ id: "f", label: X, flag: "f" }],
  roots: [{ id: "a", label: X, expanded: true, badges: [{ text: X, title: X, tone: "danger" }], cells: { owner: { value: X, text: X, badges: [{ text: X, title: X }] } },
    children: [
      { id: "a/t", label: "table", detail: { type: "table", caption: X, columns: [X, X], rows: [[X, { value: X, text: X }]] } },
      { id: "a/p", label: "properties", detail: { type: "properties", items: [{ name: X, value: X }] } }
    ] }] });

test("tree labels, titles, badges, tooltips, filters, search, details and the print outline stay text", async ({ page }) => {
  await open(page, treeView());
  const host = page.locator(".cx-host");
  await expect(host.locator(".cx-row[data-cx-id='a'] .cx-text").first()).toHaveText(X);
  await expect(host.locator(".cx-hcell").first()).toContainText("<img src=x");
  await expect(host.locator(".cx-badge").first()).toHaveAttribute("title", X);
  await expect(host.locator("caption")).toHaveText(X);
  await expect(host.locator(".cx-props dt")).toHaveText(X);
  await host.getByRole("combobox").fill("img");
  await host.getByRole("combobox").press("Escape");
  await host.getByText("Columns", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: X }).first()).toBeAttached();
  await page.keyboard.press("Escape");
  const outline = await page.evaluate(() => document.querySelector(".cx-host").canopyx.toOutline());
  expect(outline).not.toContain("<img");
  expect(outline).not.toContain("<script");
  expect(outline).toContain("&lt;img src=x");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(host.locator(".cx-outline td").first()).toContainText("<img src=x");
  await expectInert(page);
});

test("an html detail and view icons are host-trusted markup that sanitizeHtml sees first", async ({ page }) => {
  const view = { ...treeView(), icons: { doc: "<svg viewBox='0 0 16 16'><path d='M1 1h14v14H1z'/></svg>" },
    roots: [{ id: "h", label: "Notes", icon: "doc", expanded: true, children: [{ id: "h/d", label: "Detail", detail: { type: "html", html: "<p class='kept'>Kept <b>bold</b></p>" + X } }] }] };
  // The host sanitiser keeps p and b and drops everything else, returning a fragment; icons are passed through as a string.
  await open(page, view, `window.seen=[];CanopyX.configure("xss-tree",{sanitizeHtml(html,{kind}){window.seen.push(kind);if(kind==="icon")return html;
    const template=document.createElement("template");template.innerHTML=html;
    for(const element of [...template.content.querySelectorAll("*")])if(!["P","B"].includes(element.tagName))element.remove();else for(const attribute of [...element.attributes])if(attribute.name!=="class")element.removeAttribute(attribute.name);
    return template.content;}});`);
  const host = page.locator(".cx-host");
  await expect(host.locator(".kept b")).toHaveText("bold");
  await expect(host.locator(".cx-icon svg path")).toHaveCount(1);
  expect([...new Set(await page.evaluate(() => window.seen))].sort()).toEqual(["detail", "icon"]);
  // The print outline shows an html detail as text.
  const outline = await page.evaluate(() => document.querySelector(".cx-host").canopyx.toOutline());
  expect(outline).toContain("&lt;p class=");
  await expectInert(page);
});

const gridView = rows => ({ protocol: "canopyx/2", type: "grid", id: "xss-grid", label: X, pageSize: 50, selection: "multiple", source: { kind: "inline" },
  columns: [
    { id: "name", title: X, kind: "text", presenter: { kind: "link", hrefColumn: "href" } },
    { id: "state", title: X, kind: "text", presenter: { kind: "enum", tones: { ok: "success" } } },
    { id: "tags", title: X, kind: "text", presenter: { kind: "tags", separator: "," } },
    { id: "note", title: X, kind: "text" },
    { id: "amount", title: "Amount", kind: "number" },
    { id: "href", title: "Address", kind: "text", hidden: true }],
  rows });

const hrefs = ["javascript:window.__xss=1", " JaVaScRiPt:window.__xss=1", "java\nscript:window.__xss=1", "data:text/html,<script>window.__xss=1</script>",
  "vbscript:msgbox(1)", "https://example.com/a?b=<c>", "mailto:someone@example.com", "relative/page.html"];

test("grid cells, titles, pills, tags and tooltips stay text, and links only use safe schemes", async ({ page }) => {
  await open(page, gridView(hrefs.map((href, i) => ({ id: "r" + i, cells: { name: { value: X, text: X }, state: X, tags: X + "," + X, note: { value: X, text: X }, amount: i, href } }))));
  const grid = page.locator(".cx-data-grid");
  await expect(grid.locator(".cx-row[data-cx-id='r0'] .cx-cell").first()).toContainText("<img src=x");
  const links = await grid.locator(".cx-row[data-cx-id] a[href]").evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute("href")));
  expect(links.every(href => /^(https:|mailto:|http:\/\/canopyx\.test\/)/.test(href))).toBe(true);
  expect(links).toEqual(["https://example.com/a?b=%3Cc%3E", "mailto:someone@example.com", "http://canopyx.test/relative/page.html"]);
  // Unsafe destinations keep their text without a link.
  await expect(grid.locator(".cx-row[data-cx-id='r0'] .p-link")).not.toHaveAttribute("href", /.*/);
  // The record drawer and the column menu show the same strings as text.
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.openDetails("r0"));
  await expect(page.locator(".cx-drawer")).toBeVisible();
  await expect(page.locator(".cx-drawer")).toContainText("<img src=x");
  await page.keyboard.press("Escape");
  await grid.locator(".cx-grid-column-menu").first().click();
  await expect(page.locator(".cx-column-menu")).toHaveAttribute("aria-label", /<img src=x/);
  await page.keyboard.press("Escape");
  await expectInert(page);
});

test("CSV and clipboard fields that could start a spreadsheet formula are escaped", async ({ page }) => {
  const notes = ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tTAB", "\rCR", "  =padded", "＝1+1", "＋1", "－1", "＠1", "plain", "a=b"];
  await open(page, gridView(notes.map((note, i) => ({ id: "r" + String(i).padStart(2, "0"), cells: { name: "n" + i, state: "ok", tags: "t", note, amount: -i, href: "" } }))));
  const csv = await page.evaluate(() => document.querySelector(".cx-host").canopyx.toCsv({ scope: "filtered" }));
  const records = csv.trim().split("\r\n").slice(1).map(line => line.match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g).map(field => field.replace(/,$/, "")));
  const field = text => text.startsWith('"') ? text.slice(1, -1).replace(/""/g, '"') : text;
  expect(records.map(record => field(record[3]))).toEqual(["'=1+1", "'+SUM(A1)", "'-2+3", "'@cmd", "'\tTAB", "'\rCR", "'  =padded", "'＝1+1", "'＋1", "'－1", "'＠1", "plain", "a=b"]);
  // Formatted text of a negative number is text too; zero is not touched.
  expect(records.map(record => record[4])).toEqual(notes.map((_, i) => i ? "'-" + i : "0"));
  // A column title is escaped too.
  const titled = await page.evaluate(async () => {
    const host = document.createElement("div"); host.style.height = "200px"; document.body.appendChild(host);
    const api = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "titled", label: "T", pageSize: 10, selection: "multiple", source: { kind: "inline" },
      columns: [{ id: "a", title: "=HYPERLINK(\"http://x\")", kind: "text" }], rows: [{ id: "1", cells: { a: "@x" } }] } });
    await api.ready; return api.toCsv({ scope: "filtered" });
  });
  expect(titled).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"\r\n'@x\r\n");
});

test("an export format's file name is saved as a basename", async ({ page }) => {
  await open(page, gridView([{ id: "r", cells: { name: "n", state: "ok", tags: "t", note: "n", amount: 1, href: "" } }]),
    `CanopyX.registerExportFormat({id:"evil",label:"Download evil",extension:"txt",mimeType:"text/plain",write(){return new File(["x"],"../..\\\\evil<script>:name?.txt",{type:"text/plain"});}});`);
  const download = page.waitForEvent("download");
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.exportAs("evil", { scope: "filtered" }));
  const name = (await download).suggestedFilename();
  expect(name).not.toMatch(/[\\/<>:?]/);
  expect(name).toContain("evil");
  await expectInert(page);
});
