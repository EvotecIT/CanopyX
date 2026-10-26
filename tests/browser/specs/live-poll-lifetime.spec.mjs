import { test, expect } from "@playwright/test";
import { runtimeAssets } from "./support.mjs";

async function open(page, runtime) {
  const { script, style } = runtimeAssets(runtime);
  await page.route("http://127.0.0.1:8996/", route => route.fulfill({ contentType: "text/html", body:
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><style>' + style + '</style><script>' + script + '</script></head><body class="cx-page"></body></html>' }));
  await page.goto("http://127.0.0.1:8996/");
}

for (const runtime of ["grid", "reporting"]) {
  for (const navigation of ["offset", "cursor"]) for (const operation of ["stop", "pause", "hidden"]) {
    test(`${runtime} hosted ${navigation} poll ${operation} rejects a cancelled source revision`, async ({ page }) => {
      await open(page, runtime);
      await page.evaluate(async ({ runtime, navigation }) => {
        const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
        const fixture = window.fixture = { calls: 0, refreshed: 0, errors: [], hold: false };
        const cursor = navigation === "cursor";
        fixture.api = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "hosted-poll", label: "Hosted poll", rowHeight: 34, pageSize: 50,
          selection: "none", search: false, columns: [{ id: "name", title: "Name", kind: "text" }], source: { kind: "host", ...(cursor ? { navigation: "cursor" } : {}) },
          ...(cursor ? { presentation: "paged", pageLength: 50 } : {}), ...(runtime === "reporting" ? { reporting: {} } : {}) },
          onError: event => fixture.errors.push(event.error.message), source: { ...(cursor ? { navigation: "cursor" } : {}), query(query, context) {
            fixture.calls++; fixture.signal = context.signal;
            const answer = { protocol: "canopyx/2", type: cursor ? "gridCursorPage" : "gridPage", view: "hosted-poll", revision: fixture.calls === 1 ? "old" : "current",
              offset: query.offset || 0, total: 1, matched: 1, items: [{ id: "kept", cells: { name: fixture.calls === 1 ? "Original evidence" : fixture.hold ? "Retired answer" : "Current evidence" } }] };
            if (fixture.hold) return new Promise(resolve => { fixture.answer = () => resolve(answer); });
            return answer;
          } } });
        await fixture.api.ready;
        fixture.poller = await fixture.api.poll({ intervalMs: 60000, onRefresh: () => fixture.refreshed++ });
        fixture.hold = true; fixture.running = fixture.poller.refresh();
      }, { runtime, navigation });
      await expect.poll(() => page.evaluate(() => fixture.calls)).toBe(2);
      await page.evaluate(async operation => {
        if (operation === "hidden") {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => fixture.hidden });
          fixture.hidden = true; document.dispatchEvent(new Event("visibilitychange"));
        } else fixture.poller[operation]();
        fixture.hold = false; fixture.answer(); await fixture.running;
      }, operation);
      expect(await page.evaluate(() => ({ aborted: fixture.signal.aborted, revision: fixture.api.getQuery().revision,
        newData: fixture.api.getLiveState().newData, refreshed: fixture.refreshed, errors: fixture.errors })))
        .toEqual({ aborted: true, revision: "old", newData: false, refreshed: 0, errors: [] });
      await expect(page.getByText("Original evidence", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Retired answer", { exact: true })).toHaveCount(0);
      if (operation !== "stop") {
        await page.evaluate(operation => {
          if (operation === "hidden") { fixture.hidden = false; document.dispatchEvent(new Event("visibilitychange")); }
          else fixture.poller.resume();
        }, operation);
        await expect.poll(() => page.evaluate(() => fixture.refreshed)).toBe(1);
        if (navigation === "cursor") expect(await page.evaluate(() => fixture.api.getLiveState().newData)).toBe(true);
        else await expect(page.getByText("Current evidence", { exact: true }).first()).toBeVisible();
      }
      await page.evaluate(() => { fixture.poller.stop(); fixture.api.destroy(); });
    });
  }

  for (const operation of ["stop", "pause"]) test(`${runtime} poll ${operation} cancels an in-flight load and ignores its late answer`, async ({ page }) => {
    await open(page, runtime);
    await page.evaluate(async runtime => {
      const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
      const fixture = window.fixture = { loads: 0, refreshed: 0, errors: [] };
      fixture.api = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "cancelled-poll", label: "Poll lifetime", rowHeight: 34, pageSize: 50, selection: "none", search: false,
        columns: [{ id: "name", title: "Name", kind: "text" }], source: { kind: "inline" }, rows: [{ id: "kept", cells: { name: "Original evidence" } }],
        ...(runtime === "reporting" ? { reporting: {} } : {}) }, onError: event => fixture.errors.push(event.error.message) });
      await fixture.api.ready;
      fixture.poller = await fixture.api.poll({ intervalMs: 60000, onRefresh: () => fixture.refreshed++, load: context => {
        fixture.loads++; fixture.signal = context.signal;
        if (fixture.loads === 1) return new Promise(resolve => { fixture.answer = resolve; });
        return [{ id: "kept", cells: { name: "Current evidence" } }];
      } });
      fixture.running = fixture.poller.refresh();
    }, runtime);
    await expect.poll(() => page.evaluate(() => window.fixture.loads)).toBe(1);
    await page.evaluate(async operation => {
      const fixture = window.fixture;
      fixture.poller[operation]();
      fixture.answer([{ id: "kept", cells: { name: "Retired answer" } }]);
      await fixture.running;
    }, operation);
    expect(await page.evaluate(() => ({ aborted: fixture.signal.aborted, name: fixture.api.view.rows[0].cells.name, refreshed: fixture.refreshed, errors: fixture.errors })))
      .toEqual({ aborted: true, name: "Original evidence", refreshed: 0, errors: [] });
    if (operation === "pause") {
      await page.evaluate(() => fixture.poller.resume());
      await expect.poll(() => page.evaluate(() => fixture.refreshed)).toBe(1);
      expect(await page.evaluate(() => fixture.api.view.rows[0].cells.name)).toBe("Current evidence");
    }
    await page.evaluate(() => { fixture.poller.stop(); fixture.api.destroy(); });
  });

  test(`${runtime} poll reports a completed unchanged snapshot without inventing row changes`, async ({ page }) => {
    await open(page, runtime);
    const result = await page.evaluate(async runtime => {
      const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
      let refreshed = 0, changed = 0;
      const rows = [{ id: "kept", cells: { name: "Same evidence" } }];
      const api = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "unchanged-poll", label: "Unchanged poll", rowHeight: 34, pageSize: 50, selection: "none", search: false,
        columns: [{ id: "name", title: "Name", kind: "text" }], source: { kind: "inline" }, rows,
        ...(runtime === "reporting" ? { reporting: {} } : {}) }, onRowsChanged: () => changed++ });
      await api.ready;
      const poller = await api.poll({ intervalMs: 60000, load: () => rows, onRefresh: () => refreshed++ });
      await poller.refresh(); await poller.refresh(); poller.stop(); api.destroy();
      return { refreshed, changed };
    }, runtime);
    expect(result).toEqual({ refreshed: 2, changed: 0 });
  });
}
