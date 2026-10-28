import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { runtimeAssets, repo } from "./support.mjs";

async function open(page, runtime, optionsPart = false) {
  const { script, style } = runtimeAssets(runtime);
  const options = optionsPart ? fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-grid-options.js"), "utf8") : "";
  await page.route("http://127.0.0.1:8996/", route => route.fulfill({ contentType: "text/html", body:
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><style>' + style + '</style><script>' + script + options + '</script></head><body class="cx-page"></body></html>' }));
  await page.goto("http://127.0.0.1:8996/");
}

for (const runtime of ["grid", "reporting"]) {
  test(`${runtime} projected poll cannot rewind rows held by an in-flight successor query`, async ({ page }) => {
    await open(page, runtime, true);
    await page.evaluate(async runtime => {
      const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
      const fixture = window.fixture = { errors: [], successorStarted: false };
      fixture.api = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "successor", label: "Successor query", pageSize: 1, pageLength: 1, presentation: "paged",
        selection: "none", search: false, columns: [{ id: "name", title: "Name", kind: "text" }, { id: "amount", title: "Amount", kind: "number" }], source: { kind: "inline" },
        rows: [{ id: "first", cells: { name: "Original first", amount: 1 } }, { id: "next", cells: { name: "Original next", amount: 2 } }],
        footers: [{ id: "all", label: "Total", scope: "all", aggregates: [{ id: "sum", column: "amount", operation: "sum", label: "Sum" }] }],
        ...(runtime === "reporting" ? { reporting: {} } : {}) }, onError: event => fixture.errors.push(event.error.message) });
      await fixture.api.ready;
      fixture.poller = await fixture.api.poll({ intervalMs: 60000, load: () => [
        { id: "first", cells: { name: "Current first", amount: 10 } }, { id: "next", cells: { name: "Current next", amount: 20 } }
      ] });
      const observer = new MutationObserver(() => {
        if (host.querySelector('[role="grid"]').getAttribute("aria-busy") === "true") {
          observer.disconnect(); fixture.successorStarted = true; fixture.successor = fixture.api.reload();
        }
      });
      observer.observe(host, { subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
      await fixture.poller.refresh(); await fixture.successor;
    }, runtime);
    expect(await page.evaluate(() => fixture.successorStarted)).toBe(true);
    await expect(page.getByText("Current first", { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => ({ accepted: fixture.api.getLoadedRows(["first"])[0].cells.name,
      owned: fixture.api.view.rows.find(row => row.id === "first").cells.name, errors: fixture.errors })))
      .toEqual({ accepted: "Current first", owned: "Current first", errors: [] });
    // No additional poll is allowed to repair the dataset before this next page reads it.
    await page.evaluate(() => fixture.api.nextPage());
    await expect(page.getByText("Current next", { exact: true }).first()).toBeVisible();
    await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 30");
    await page.evaluate(() => { fixture.poller.stop(); fixture.api.destroy(); });
  });

  test(`${runtime} active host AbortError keeps the initial failure visible and retryable`, async ({ page }) => {
    await open(page, runtime);
    await page.evaluate(runtime => {
      const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
      const fixture = window.fixture = { calls: 0, errors: [] };
      fixture.api = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "retry-host", label: "Retry host", pageSize: 50,
        selection: "none", search: false, columns: [{ id: "name", title: "Name", kind: "text" }], source: { kind: "host" },
        ...(runtime === "reporting" ? { reporting: {} } : {}) }, onError: event => fixture.errors.push(event.error.message),
        source: { query: query => {
          if (++fixture.calls === 1) throw new DOMException("Transient host abort", "AbortError");
          return { protocol: "canopyx/2", type: "gridPage", view: "retry-host", revision: "recovered", offset: query.offset, total: 1, matched: 1, items: [{ id: "one", cells: { name: "Recovered evidence" } }] };
        } } });
      fixture.api.ready.catch(() => {});
    }, runtime);
    await expect(page.locator(".cx-grid-notice")).toContainText("Transient host abort");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByText("Recovered evidence", { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => ({ calls: fixture.calls, errors: fixture.errors }))).toEqual({ calls: 2, errors: ["Transient host abort"] });
    await page.evaluate(() => fixture.api.destroy());
  });

  test(`${runtime} active poll load AbortError is reported and the next load recovers`, async ({ page }) => {
    await open(page, runtime);
    await page.evaluate(async runtime => {
      const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
      const fixture = window.fixture = { calls: 0, errors: [] };
      fixture.api = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "load-retry", label: "Load retry", pageSize: 50,
        selection: "none", search: false, columns: [{ id: "name", title: "Name", kind: "text" }], source: { kind: "inline" },
        rows: [{ id: "kept", cells: { name: "Original evidence" } }], ...(runtime === "reporting" ? { reporting: {} } : {}) },
        onError: event => fixture.errors.push(event.error.message) });
      await fixture.api.ready;
      fixture.poller = await fixture.api.poll({ intervalMs: 60000, load: () => {
        if (++fixture.calls === 1) throw new DOMException("Transient poll abort", "AbortError");
        return [{ id: "kept", cells: { name: "Current evidence" } }];
      } });
      await fixture.poller.refresh();
    }, runtime);
    expect(await page.evaluate(() => fixture.errors)).toEqual(["Transient poll abort"]);
    await expect(page.getByText("Original evidence", { exact: true }).first()).toBeVisible();
    await page.evaluate(() => fixture.poller.refresh());
    await expect(page.getByText("Current evidence", { exact: true }).first()).toBeVisible();
    await page.evaluate(() => { fixture.poller.stop(); fixture.api.destroy(); });
  });

  for (const interruption of ["pause", "query refresh", "aggregate failure", "API aggregate failure"]) test(`${runtime} projected poll recovers the same rows after ${interruption}`, async ({ page }) => {
    await open(page, runtime, true);
    await page.evaluate(async ({ runtime, interruption }) => {
      const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
      const fixture = window.fixture = { errors: [], changes: [], refreshed: 0, interrupted: false, fail: false };
      CanopyX.use({ name: "projection-proof", aggregates: { checkedTotal: values => {
        if (fixture.fail) { fixture.interrupted = true; throw new Error("Projection temporarily unavailable"); }
        return values.reduce((sum, value) => sum + value, 0);
      } } });
      fixture.api = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "projected-retry", label: "Projected retry", pageSize: 50,
        selection: "none", search: false, columns: [{ id: "name", title: "Name", kind: "text" }, { id: "amount", title: "Amount", kind: "number" }], source: { kind: "inline" },
        rows: [{ id: "kept", cells: { name: "Original evidence", amount: 1 } }],
        footers: [{ id: "all", label: "Total", scope: "all", aggregates: [{ id: "sum", column: "amount", operation: "checkedTotal", label: "Sum" }] }],
        ...(runtime === "reporting" ? { reporting: {} } : {}) }, onError: event => fixture.errors.push(event.error.message),
        onRowsChanged: event => fixture.changes.push({ source: event.source, updated: event.updated }) });
      await fixture.api.ready;
      fixture.poller = await fixture.api.poll({ intervalMs: 60000, onRefresh: () => fixture.refreshed++,
        load: () => [{ id: "kept", cells: { name: "Current evidence", amount: 2 } }] });
      if (interruption === "pause" || interruption === "query refresh") {
        fixture.observer = new MutationObserver(() => {
          if (host.querySelector('[role="grid"]').getAttribute("aria-busy") === "true") {
            fixture.observer.disconnect(); fixture.interrupted = true;
            if (interruption === "pause") fixture.poller.pause();
            else fixture.userQuery = fixture.api.setQuery(fixture.api.getQuery());
          }
        });
        fixture.observer.observe(host, { subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
      } else fixture.fail = true;
      if (interruption === "API aggregate failure") await fixture.api.setRows([{ id: "kept", cells: { name: "Current evidence", amount: 2 } }]).catch(error => { fixture.apiError = error.message; });
      else await fixture.poller.refresh();
    }, { runtime, interruption });
    expect(await page.evaluate(() => fixture.interrupted)).toBe(true);
    if (interruption === "query refresh") {
      await page.evaluate(() => fixture.userQuery);
      expect(await page.evaluate(() => fixture.errors)).toEqual([]);
    } else {
      await expect(page.getByText("Original evidence", { exact: true }).first()).toBeVisible();
      expect(await page.evaluate(() => fixture.api.getLiveState().pending)).toBe(1);
    }
    await page.evaluate(async interruption => {
      fixture.fail = false;
      if (interruption === "pause") fixture.poller.resume();
      else if (interruption === "API aggregate failure") await fixture.api.setRows([{ id: "kept", cells: { name: "Current evidence", amount: 2 } }]);
      else await fixture.poller.refresh();
    }, interruption);
    await expect(page.getByText("Current evidence", { exact: true }).first()).toBeVisible();
    await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 2");
    expect(await page.evaluate(() => fixture.api.view.rows[0].cells.name)).toBe("Current evidence");
    expect(await page.evaluate(() => fixture.api.getLiveState().pending)).toBe(0);
    if (interruption !== "query refresh") expect(await page.evaluate(() => fixture.changes))
      .toContainEqual({ source: interruption === "API aggregate failure" ? "api" : "poll", updated: ["kept"] });
    await page.evaluate(() => { fixture.poller.stop(); fixture.api.destroy(); });
  });

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
