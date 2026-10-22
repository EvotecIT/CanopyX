import { test, expect } from "@playwright/test";
import { api, definition, open, drawer } from "./record-panel-fixtures.mjs";
import { viewPage, nextFrames } from "./support.mjs";

const title = page => drawer(page).locator("h4");

test("a link opens its record in place, with a breadcrumb trail; Back returns focus to the link", async ({ page }) => {
  await open(page, definition());
  await page.locator('.cx-row[data-cx-id="c001"]').focus();
  await page.keyboard.press("Enter");
  const link = drawer(page).getByRole("button", { name: "Team B" });
  await expect(link).toHaveClass(/cx-record-link/);
  await link.click();
  await expect(title(page)).toHaveText("host2.example.test");
  await expect(title(page)).toBeFocused();
  const trail = drawer(page).getByRole("navigation", { name: "Record trail" });
  await expect(trail.locator(".cx-record-crumb")).toHaveText(["host1.example.test"]);
  await expect(drawer(page).locator(".cx-record-live")).toHaveText("Showing host2.example.test");
  // The record the link opened is in the accepted result, so previous and next follow it.
  await expect(drawer(page).getByRole("button", { name: "Next record" })).toBeEnabled();
  // One more step, then back two at once through the trail.
  await drawer(page).getByRole("button", { name: "Team C" }).click();
  await expect(title(page)).toHaveText("host3.example.test");
  await expect(drawer(page).getByRole("navigation", { name: "Record trail" }).locator(".cx-record-crumb")).toHaveText(["host1.example.test", "host2.example.test"]);
  await drawer(page).getByRole("button", { name: "Back to host2.example.test" }).click();
  await expect(title(page)).toHaveText("host2.example.test");
  await expect(drawer(page).getByRole("button", { name: "Team C" })).toBeFocused();
  await expect(drawer(page).locator(".cx-record-live")).toHaveText("Back to host2.example.test");
  // Alt+Left goes back too.
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(title(page)).toHaveText("host1.example.test");
  await expect(drawer(page).getByRole("navigation", { name: "Record trail" })).toHaveCount(0);
  await expect(drawer(page).getByRole("button", { name: "Team B" })).toBeFocused();
  // Closing returns focus where the reader started.
  await page.keyboard.press("Escape");
  await expect(page.locator('.cx-row[data-cx-id="c001"]')).toBeFocused();
});

test("a related record outside the accepted result opens on its own, without previous and next", async ({ page }) => {
  await open(page, definition());
  await page.evaluate(api + ".setQuery({ search: 'host1.example' })");
  await page.evaluate(api + ".openDetails('c001')");
  await drawer(page).getByRole("button", { name: "Team B" }).click();
  await expect(title(page)).toHaveText("host2.example.test");
  await expect(drawer(page).getByRole("button", { name: "Next record" })).toBeDisabled();
  await expect(drawer(page).getByRole("button", { name: "Previous record" })).toBeDisabled();
  const missing = await page.evaluate(api + ".openRecord('nope').then(() => 'opened', error => error.message)");
  expect(missing).toContain("not available");
});

test("a link to a record nobody has stays on the current record and says so", async ({ page }) => {
  const view = definition(); view.rows[1].cells.owner.ref = { id: "gone" };
  await open(page, view);
  await page.evaluate(api + ".openDetails('c001')");
  await drawer(page).getByRole("button", { name: "Team B" }).click();
  await expect(drawer(page).locator(".cx-record-live")).toHaveText("Record gone is not available here.");
  await expect(title(page)).toHaveText("host1.example.test");
  await expect(page.locator("dialog.cx-drawer")).toHaveCount(1);
});
test("collections: a nested grid with its own sorting; a row opens its record; Open all in grid filters the target grid", async ({ page }) => {
  await open(page, definition());
  await page.evaluate(api + ".openDetails('c001')");
  await drawer(page).getByRole("tab", { name: "Related" }).click();
  const nested = drawer(page).locator(".cx-record-nested");
  await expect(nested.locator(".cx-row[data-cx-id]")).toHaveCount(3);
  const names = nested.locator(".cx-row[data-cx-id] .cx-cell:first-child").locator(":scope > .cx-text,:scope > .cx-phone-primary > .cx-text");
  await expect(names).toHaveText(["host2.example.test", "host3.example.test", "host4.example.test"]);
  await nested.getByRole("columnheader", { name: "Common name" }).locator("button").first().click();
  await nested.getByRole("columnheader", { name: "Common name" }).locator("button").first().click();
  await expect(names.first()).toHaveText("host4.example.test");
  // Enter on a nested row opens that record (the collection's target view), never a second drawer.
  await nested.locator(".cx-row[data-cx-id]").first().focus();
  await page.keyboard.press("Enter");
  await expect(title(page)).toHaveText("host4.example.test");
  await expect(page.locator("dialog.cx-drawer")).toHaveCount(1);
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(title(page)).toHaveText("host1.example.test");
  await expect(drawer(page).getByRole("tab", { name: "Related" })).toHaveAttribute("aria-selected", "true");
  // Open all in grid: the host's hook comes first and may take it over.
  await page.evaluate(() => { window.openAll = []; document.querySelector("[data-canopyx-host]").addEventListener("canopyx:openAll", event => window.openAll.push(event.detail)); });
  await drawer(page).getByRole("button", { name: "Open all in grid" }).click();
  await expect(drawer(page)).toHaveCount(0);
  const detail = await page.evaluate("window.openAll[0]");
  expect(detail).toMatchObject({ view: "certificates", record: "c001", field: "related", filters: [{ column: "cn", operator: "in", values: ["host1.example.test"] }] });
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(2);
  expect(await page.evaluate(api + ".getQuery().filters")).toEqual([{ column: "cn", operator: "in", values: ["host1.example.test"] }]);
});

test("Open all in grid can be taken over by the host", async ({ page }) => {
  await open(page, definition());
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").addEventListener("canopyx:openAll", event => event.preventDefault()));
  await page.evaluate(api + ".openDetails('c001')");
  await drawer(page).getByRole("tab", { name: "Related" }).click();
  await drawer(page).getByRole("button", { name: "Open all in grid" }).click();
  await expect(drawer(page)).toBeVisible();
  expect(await page.evaluate(api + ".getQuery().filters")).toEqual([]);
});

test("record deep links: the address opens the grid at the record with its drawer; opening and closing write it", async ({ page }) => {
  await open(page, definition({}, 60), "#other=1&record=certificates:c045");
  await expect(title(page)).toHaveText("host15.example.test");
  await expect(page.locator('.cx-row[data-cx-id="c045"]')).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#other=1&record=certificates:c045");
  await drawer(page).locator("h4").focus();
  await page.keyboard.press("ArrowDown");
  await expect(title(page)).toHaveText("host16.example.test");
  expect(new URL(page.url()).hash).toBe("#other=1&record=certificates:c046");
  await page.keyboard.press("Escape");
  await expect.poll(() => new URL(page.url()).hash).toBe("#other=1");
  // Changing the address opens another record.
  await page.evaluate(() => { location.hash = "record=certificates:c010"; });
  await expect(title(page)).toHaveText("host10.example.test");
  // Copy link copies the record's address.
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: text => { window.copied = text; return Promise.resolve(); } } }));
  await drawer(page).getByRole("button", { name: "Record actions" }).click();
  await drawer(page).getByRole("menuitem", { name: "Copy link" }).click();
  await expect.poll(() => page.evaluate("window.copied")).toBe("http://canopyx.test/records.html#record=certificates:c010");
  await expect(drawer(page).locator(".cx-record-live")).toHaveText("Copied to the clipboard");
});

test("a configured deep link key and a record outside the current filter", async ({ page }) => {
  const view = definition(); view.record.deepLink = { key: "cert" };
  await open(page, view, "#cert=certificates:c004");
  await expect(title(page)).toHaveText("host4.example.test");
  await page.keyboard.press("Escape");
  await page.evaluate(api + ".setQuery({ search: 'host1.example' })");
  await page.evaluate(() => { location.hash = "cert=certificates:c005"; });
  await expect(title(page)).toHaveText("host5.example.test");
  await expect(drawer(page).getByRole("button", { name: "Next record" })).toBeDisabled();
});

for (const kind of ["grid", "tree"]) {
  const linkedView = () => {
    const view = definition(); view.record.deepLink = { key: "cert" };
    if (kind === "tree") {
      view.type = "view";
      view.roots = [{ id: "issuer", label: "Issuer", expanded: true,
        children: view.rows.map(row => ({ ...row, label: row.cells.cn.value })) }];
      delete view.rows;
    }
    return view;
  };
  const address = id => "other=1&cert=another-view:keep&cert=certificates:" + (kind === "tree" ? "issuer/" : "") + id;

  test(`${kind} closing a record preserves a newer deep link from the host`, async ({ page }) => {
    await open(page, linkedView(), "#" + address("c004"));
    await expect(title(page)).toHaveText("host4.example.test");
    // The native close event is queued. A normal bubbling host handler can accept a query and navigate first.
    await page.evaluate(({ kind, next }) => {
      document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        const api = document.querySelector("[data-canopyx-host]").canopyx;
        window.recordTransition = Promise.resolve(kind === "grid" ? api.setQuery({ search: "host1.example" }) : undefined)
          .then(() => { location.hash = next; });
      }, { once: true });
    }, { kind, next: address("c005") });
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.recordTransition);
    await expect(title(page)).toHaveText("host5.example.test");
    await expect.poll(() => new URL(page.url()).hash).toBe("#" + address("c005"));
    if (kind === "grid") await expect(drawer(page).getByRole("button", { name: "Next record" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect.poll(() => new URL(page.url()).hash).toBe("#other=1&cert=another-view:keep");
  });

  test(`${kind} a queued close does not clear a public same-record reopening`, async ({ page }) => {
    await open(page, linkedView(), "#" + address("c004"));
    await expect(title(page)).toHaveText("host4.example.test");
    await page.evaluate(() => {
      window.closedRecord = document.querySelector("dialog.cx-drawer");
      window.closedRecordEvent = new Promise(resolve => window.closedRecord.addEventListener("close", resolve, { once: true }));
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") window.recordTransition = document.querySelector("[data-canopyx-host]").canopyx.openRecord("c004");
      }, { once: true });
    });
    await page.keyboard.press("Escape");
    await page.evaluate(async () => { await window.recordTransition; await window.closedRecordEvent; });
    await expect(title(page)).toHaveText("host4.example.test");
    expect(await drawer(page).evaluate(dialog => dialog.open && dialog !== window.closedRecord)).toBe(true);
    await expect.poll(() => new URL(page.url()).hash).toBe("#" + address("c004"));
    // A failed public open owns no replacement address: the old closed panel's link still clears normally.
    await page.evaluate(() => {
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") window.recordTransition = document.querySelector("[data-canopyx-host]").canopyx.openRecord("missing")
          .then(() => "opened", error => error.message);
      }, { once: true });
    });
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => window.recordTransition)).toContain("not available");
    await expect.poll(() => new URL(page.url()).hash).toBe("#other=1&cert=another-view:keep");
    // A genuine later hashchange can name that same record again after its previous drawer closes.
    await page.evaluate(hash => { location.hash = hash; }, address("c004"));
    await expect(title(page)).toHaveText("host4.example.test");
  });
}

test("tree deep link paths distinguish slashes inside identifiers from path separators", async ({ page }) => {
  const view = definition(); view.type = "view"; view.record.deepLink = { key: "cert" }; delete view.rows;
  view.roots = [
    { id: "a/b", label: "First issuer", children: [{ id: "c", label: "First certificate", cells: { cn: "First certificate" } }] },
    { id: "a", label: "Second issuer", children: [{ id: "b/c", label: "Second certificate", cells: { cn: "Second certificate" } }] }
  ];
  await open(page, view, "#cert=certificates:a%2Fb/c");
  await expect(title(page)).toHaveText("First certificate");
  await page.evaluate(() => { location.hash = "cert=certificates:a/b%2Fc"; });
  await expect(title(page)).toHaveText("Second certificate");
  expect(new URL(page.url()).hash).toBe("#cert=certificates:a/b%2Fc");
});

for (const [from, to] of [["grid", "grid"], ["tree", "tree"], ["grid", "tree"], ["tree", "grid"]]) {
  test(`${from} to ${to} related navigation stays retired when an unrelated URL field changes`, async ({ page }) => {
    const asKind = (view, kind) => {
      if (kind === "tree") { view.type = "view"; view.roots = view.rows.map(row => ({ ...row, label: row.cells.cn.value })); delete view.rows; }
      return view;
    };
    const first = asKind(definition(), from), second = asKind(definition({ id: "other", label: "Other inventory" }), to);
    first[from === "tree" ? "roots" : "rows"][1].cells.owner = { value: "Other inventory", ref: { view: "other", id: "c002" } };
    const body = html => html.slice(html.lastIndexOf('<body class="cx-page">') + '<body class="cx-page">'.length, html.lastIndexOf("</body>"));
    // The grid runtime also mounts trees; both public views share the canonical record part.
    const base = viewPage(definition()), html = base.replace(body(base), body(viewPage(first)) + body(viewPage(second)));
    await page.route("http://canopyx.test/two.html", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("http://canopyx.test/two.html");
    await page.waitForFunction(() => document.querySelectorAll("[data-cx-ready]").length === 2);
    await page.evaluate(async () => {
      for (const host of document.querySelectorAll("[data-canopyx-host]")) await host.canopyx.ready;
      await document.querySelector("[data-canopyx-host]").canopyx.openRecord("c001");
      const dialog = document.querySelector("dialog.cx-drawer");
      window.firstRecordClosed = new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
    });
    await drawer(page).getByRole("button", { name: "Other inventory", exact: true }).click();
    await expect(title(page)).toHaveText("host2.example.test");
    await page.evaluate(() => window.firstRecordClosed);
    await page.evaluate(() => {
      window.fragmentChanged = new Promise(resolve => addEventListener("hashchange", resolve, { once: true }));
      location.hash += "&hostTab=details";
    });
    await page.evaluate(() => window.fragmentChanged);
    await nextFrames(page);
    await expect(drawer(page)).toHaveCount(1);
    await expect(drawer(page)).toHaveAttribute("data-cx-view", "other");
    await expect(title(page)).toHaveText("host2.example.test");
    await expect(drawer(page).getByRole("button", { name: "Back to host1.example.test" })).toBeVisible();
    expect(new URL(page.url()).hash).toBe("#record=certificates:c001&record=other:c002&hostTab=details");
  });
}
