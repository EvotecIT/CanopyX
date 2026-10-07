// Phone layout: the first cell carries exactly one "+N hidden fields" affordance however often rows are recycled.
import { test, expect } from "@playwright/test";
import path from "node:path";
import { viewPage, nextFrames } from "./support.mjs";

const columns = [
  { id: "name", title: "Name", kind: "text", width: 240, sortable: true },
  { id: "state", title: "State", kind: "text", width: 140, sortable: true },
  { id: "amount", title: "Amount", kind: "number", width: 140, sortable: true },
  { id: "note", title: "Note", kind: "text", width: 240, hidden: true }
];
const rows = Array.from({ length: 40 }, (_, i) => ({
  id: "r" + i,
  cells: { name: i === 1 ? "server-01.branch-office.corp.example.com" : "server-" + String(i).padStart(2, "0"), state: i % 3 ? "Pass" : "Fail", amount: i % 5, note: "Note " + i }
}));

// A host renderer draws the first cell into the fresh element it gets on every paint.
const NAME_RENDERER = "<script>CanopyX.configure(\"phone\",{renderers:{name(row,element){const text=document.createElement(\"span\");text.className=\"cx-text\";text.textContent=row.cells.name;element.appendChild(text);return true;}}});</script></head>";

async function open(page, patch = {}, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  const { firstPresenter, renderer, ...rest } = patch;
  const view = { protocol: "canopyx/2", type: "grid", id: "phone", label: "Servers", pageSize: 10, selection: "single", search: true, source: { kind: "inline" }, columns: structuredClone(columns), rows, ...rest };
  if (firstPresenter) view.columns[0].presenter = firstPresenter;
  let html = viewPage(view);
  if (renderer) html = html.replace("</head>", NAME_RENDERER);
  await page.route("http://canopyx.test/phone", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/phone");
  await api(page, grid => grid.ready);
  await settle(page);
}
const api = (page, run) => page.locator("[data-canopyx-host]").evaluate((host, source) => eval(source)(host.canopyx), run.toString());
const setQuery = (page, query) => page.locator("[data-canopyx-host]").evaluate((host, value) => host.canopyx.setQuery(value), query);
async function settle(page) { await nextFrames(page); await nextFrames(page); }
async function capture(page, name) { if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, name + ".png") }); }

/** For each rendered record row: how many affordances its first cell holds, their text, and the record they open. */
function affordances(page) {
  return page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")].map(row => {
    const buttons = [...row.querySelectorAll(".cx-hidden-fields")];
    return { id: row.getAttribute("data-cx-id"), count: buttons.length, inFirstCell: buttons.every(button => button.closest(".cx-cell") === row.firstElementChild),
      text: buttons.map(button => button.textContent).join(" "), record: buttons.map(button => button.dataset.cxRecord).join(" ") };
  }));
}
async function expectOnePerRow(page, text = "+1") {
  const list = await affordances(page);
  expect(list.length).toBeGreaterThan(0);
  expect(list).toEqual(list.map(row => ({ id: row.id, count: 1, inFirstCell: true, text, record: row.id })));
}

for (const variant of ["text", "presenter", "renderer", "reporting"]) {
  test("hidden fields stay one per row across repeated query changes (" + variant + " first column)", async ({ page }) => {
    await open(page, variant === "presenter" ? { firstPresenter: { kind: "identifier" } } : variant === "renderer" ? { renderer: true } : variant === "reporting" ? { reporting: {} } : {});
    await expectOnePerRow(page);
    const queries = [{ search: "server" }, { search: "server", sort: [{ column: "amount", direction: "asc" }] },
      { filters: [{ column: "state", operator: "eq", values: ["Pass"] }] }, { search: "1" }, { search: "" }, { sort: [{ column: "name", direction: "desc" }] }];
    for (const query of queries) {
      await setQuery(page, query);
      await settle(page);
      await expectOnePerRow(page);
    }
    const search = page.getByRole("searchbox").first();
    for (const text of ["server-1", "server-2", "server"]) {
      await search.fill(text);
      await expect.poll(() => api(page, grid => grid.getQuery()?.search)).toBe(text);
      await settle(page);
      await expectOnePerRow(page);
    }
  });
}

test("hidden fields stay one per row while paging forward and back", async ({ page }) => {
  await open(page, { presentation: "paged", pageLength: 10 });
  await expectOnePerRow(page);
  for (let index = 0; index < 3; index++) {
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect.poll(() => api(page, grid => grid.getPaging().pageIndex)).toBe(index + 1);
    await settle(page);
    await expectOnePerRow(page);
  }
  await api(page, grid => grid.goToPage(0));
  await settle(page);
  await expectOnePerRow(page);
  expect((await affordances(page))[0].id).toBe("r0");
});

test("hidden fields stay one per row while sorting from the header", async ({ page }) => {
  await open(page, { presentation: "paged", pageLength: 10 });
  const sort = page.locator('.cx-hcell[data-cx-column="name"] .cx-sort');
  for (const direction of ["asc", "desc", null, "asc", "desc"]) {
    await sort.click();
    const header = page.locator('.cx-hcell[data-cx-column="name"]');
    if (direction) await expect(header).toHaveAttribute("data-cx-sort", direction);
    else await expect(header).not.toHaveAttribute("data-cx-sort", /./);
    await settle(page);
    await expectOnePerRow(page);
  }
});

test("hidden fields stay one per row across theme switches", async ({ page }) => {
  await open(page);
  const host = page.locator("[data-canopyx-host]");
  for (const theme of ["dark", "light", "dark"]) {
    await host.evaluate((element, value) => element.setAttribute("data-cx-theme", value), theme);
    await api(page, grid => grid.refresh());
    await settle(page);
    await expectOnePerRow(page);
    await api(page, grid => grid.setQuery({ search: "server" }));
    await api(page, grid => grid.setQuery({ search: "" }));
    await settle(page);
    await expectOnePerRow(page);
  }
});

test("hidden fields stay one per row while scrolling recycles rows", async ({ page }) => {
  const many = Array.from({ length: 200 }, (_, i) => ({ id: "s" + i, cells: { name: "host-" + String(i).padStart(3, "0"), state: "Pass", amount: i % 5, note: "Note " + i } }));
  await open(page, { rows: many });
  await expectOnePerRow(page);
  const grid = page.locator(".cx-data-grid .cx-grid");
  for (const top of [2000, 6000, 1000, 0, 4000]) {
    await grid.evaluate((element, value) => { element.scrollTop = value; }, top);
    await settle(page);
    await expectOnePerRow(page);
  }
});
test("hidden fields follow the phone breakpoint in both directions", async ({ page }) => {
  await open(page, { presentation: "paged", pageLength: 10 });
  const count = async () => (await affordances(page)).reduce((sum, row) => sum + row.count, 0);
  for (let round = 0; round < 2; round++) {
    await page.setViewportSize({ width: 1000, height: 844 });
    await expect.poll(() => page.locator(".cx-data-grid").evaluate(element => element.classList.contains("cx-phone"))).toBe(false);
    await settle(page);
    expect(await count()).toBe(0);
    await api(page, grid => grid.nextPage());
    await settle(page);
    expect(await count()).toBe(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.locator(".cx-data-grid").evaluate(element => element.classList.contains("cx-phone"))).toBe(true);
    await settle(page);
    await expectOnePerRow(page);
    await api(page, grid => grid.goToPage(0));
    await settle(page);
    await expectOnePerRow(page);
  }
});

for (const theme of ["light", "dark"]) {
  test("phone first column keeps the name readable next to a compact affordance (" + theme + ")", async ({ page }) => {
    await open(page, { presentation: "paged", pageLength: 10 });
    await page.locator("[data-canopyx-host]").evaluate((element, value) => element.setAttribute("data-cx-theme", value), theme);
    for (const search of ["server", "", "server", ""]) await setQuery(page, { search });
    await settle(page);
    const geometry = await page.locator('.cx-row[data-cx-id="r1"] .cx-cell').first().evaluate(cell => {
      const text = cell.querySelector(".cx-text"), button = cell.querySelector(".cx-hidden-fields");
      const box = cell.getBoundingClientRect(), textBox = text.getBoundingClientRect(), buttonBox = button.getBoundingClientRect();
      const style = getComputedStyle(text);
      return { truncated: text.scrollWidth > text.clientWidth, overflow: style.textOverflow, textWidth: textBox.width,
        buttonWidth: buttonBox.width, buttonContent: button.scrollWidth, cellWidth: box.width, buttonInside: buttonBox.left >= textBox.right - 0.5 && buttonBox.right <= box.right + 0.5 };
    });
    expect(geometry.truncated).toBe(true);
    expect(geometry.overflow).toBe("ellipsis");
    expect(geometry.textWidth).toBeGreaterThan(120);
    expect(geometry.buttonWidth).toBeLessThanOrEqual(geometry.buttonContent + 1);
    expect(geometry.buttonWidth).toBeLessThan(40);
    expect(geometry.buttonWidth).toBeLessThan(geometry.cellWidth / 4);
    expect(geometry.buttonInside).toBe(true);
    await capture(page, "phone-hidden-fields-" + theme + "-390");
  });
}
