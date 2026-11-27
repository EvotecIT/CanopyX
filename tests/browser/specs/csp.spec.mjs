// Strict Content Security Policy and Trusted Types (docs/security.md). The pages in csp/ are written with the nonce
// placeholder of CanopyX.Examples/CspExamples.cs; this server puts a fresh nonce in its place in every response and sends
// the policy as a header, as a real server would. A test fails on any securitypolicyviolation event, any console report of
// a refused script or style, and any page error, while it loads each page and the lazy parts: the tree tools, export,
// filter editor, history, search and links parts, sidecar files, html details, icons and the print outline.
import { test, expect } from "@playwright/test";
import { ORIGIN, POLICIES, TRUSTED_TYPES, serve, open, expectClean, exerciseTree, exerciseGrid } from "./csp-support.mjs";

for (const nonceOwner of ['runtime', 'setNonce']) test(`grid print applies its stylesheet with an unnonced font link and ${nonceOwner}`, async ({ page }) => {
  const nonce = 'canopy-print-nonce';
  await page.addInitScript(() => { window.print = () => {
    window.parent.printedStyle = {
      styles: document.querySelectorAll('style').length,
      sheets: document.adoptedStyleSheets.length,
      display: getComputedStyle(document.querySelector('.cx-print-cards')).display,
      fontNonce: document.querySelector('link[data-font-source]').nonce
    };
  }; });
  const report = await serve(page, () => POLICIES['self and nonce'](nonce), {
    transform: html => nonceOwner === 'runtime' ? html.replace('<script src=', `<script nonce="${nonce}" src=`) : html
  });
  await page.goto(ORIGIN + '/fonts/hashed.html');
  await page.waitForSelector('[data-cx-ready]');
  if (nonceOwner === 'setNonce') await page.evaluate(nonce => CanopyX.setNonce(nonce), nonce);
  await page.evaluate(async () => {
    const host = document.querySelector('[data-canopyx-host]'), original = host.canopyx, view = structuredClone(original.view);
    view.layout = { mode: 'cards' }; original.destroy(); host.replaceChildren();
    const grid = CanopyX.createDataGrid(host, { view }); await grid.ready;
    await grid.print({ scope: 'all' });
  });
  // The paper's rules are a constructed stylesheet, which needs no nonce; the font stylesheet is linked again.
  expect(await page.evaluate(() => window.printedStyle)).toEqual({ styles: 0, sheets: 1, display: 'grid', fontNonce: '' });
  await expect(page.locator('iframe')).toHaveCount(0);
  await expectClean(page, report);
});

for (const [label, policy] of Object.entries(POLICIES)) {
  test.describe(`under a strict policy (${label})`, () => {
    test("an inline tree page loads its parts, icons, html detail and print outline without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await open(page, "tree.html");
      await exerciseTree(page);
      await expectClean(page, report);
    });

    test("an inline interactive tree checks rows without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await open(page, "interactive.html");
      const check = page.locator(".cx-check").first();
      await check.click();
      await expect(check).toBeChecked();
      await expectClean(page, report);
    });

    test("an inline grid loads its history, filter editor and export parts without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await open(page, "grid.html");
      await exerciseGrid(page);
      await page.locator(".cx-grid-filters > summary").click();
      await expect(page.locator(".cx-grid-filters .cx-grid-panel")).toBeVisible();
      await expectClean(page, report);
    });

    test("a dialog flow picks rows in its embedded grid and reaches its review without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await open(page, "flow.html");
      await page.getByRole("button", { name: "Retire servers…" }).click();
      await page.locator(".cx-flow-pick-view .cx-grid-row-select").first().check();
      await expect(page.locator(".cx-flow-tray-item")).toHaveCount(1);
      await page.locator(".cx-flow-actions .cx-flow-next").click();
      await page.locator('[data-cx-field="reason"] textarea').fill("Replaced");
      await page.locator(".cx-flow-actions .cx-flow-next").click();
      await expect(page.locator(".cx-flow-confirm input")).toBeVisible();
      await expectClean(page, report);
    });

    test("a task list opens a task whose section the host would supply without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await open(page, "flow-tasks.html");
      await page.locator('.cx-flow-task[data-cx-task="database"] button').click();
      // No host answers here: the section says so in place, which is the point under the policy.
      await expect(page.locator(".cx-flow-error, .cx-flow-loading").first()).toBeAttached();
      await page.getByRole("button", { name: "Back to tasks" }).click();
      await expectClean(page, report);
    });

    test("a matrix loads its part, draws its cells and opens a cell's details without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await open(page, "matrix.html");
      await expect(page.locator(".cx-mx-row canvas").first()).toBeAttached();
      await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.focusCell("srv01", "dns"));
      await page.keyboard.press("Enter");
      await expect(page.locator("dialog.cx-mx-dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
      await expect(page.locator(".cx-mx-print table")).toBeAttached();
      await expectClean(page, report);
    });

    test("a bundle loads external assets, part files, sidecar files and the search part without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await open(page, "bundle/index.html");
      const host = page.locator(".cx-host").first();
      const share = host.locator(".cx-row[aria-level='1'][aria-expanded='false']").first();
      await share.locator(".cx-exp").click();
      await expect(host.locator(".cx-row[aria-level='2']").first()).toBeVisible();
      await page.getByRole("combobox").fill("budget");
      await expect(page.getByRole("option").first()).toBeVisible();
      await page.keyboard.press("Escape");
      await host.getByText("Export", { exact: true }).click();
      await expectClean(page, report);
    });

    test("fragments sharing one document take their nonced heights and parts without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await page.setViewportSize({ width: 1400, height: 900 });
      await open(page, "fragments.html");
      await expect(page.locator("[data-canopyx-host][data-cx-ready]")).toHaveCount(2);
      // The grid takes its 60vh; the tree is as tall as its rows up to its 50vh. Both rules came in nonced style elements.
      const heights = await page.locator("[data-canopyx-host]").evaluateAll(hosts => hosts.map(host => Math.round(host.getBoundingClientRect().height)));
      expect(heights[0]).toBeLessThanOrEqual(450);
      expect(heights[1]).toBe(540);
      // The same explicit height wins inside full-page chrome, including its nested main host default.
      await page.evaluate(() => { document.body.classList.add("cx-page"); document.querySelector("main").classList.add("cx-main"); });
      await expect.poll(() => page.locator("[data-canopyx-host]").nth(1).evaluate(host => Math.round(host.getBoundingClientRect().height))).toBe(540);
      await exerciseGrid(page);
      await expectClean(page, report);
    });
  });
}

test("the harness reports a violation when the markup's nonce is not the response's", async ({ page }) => {
  const report = await serve(page, POLICIES["nonce only"], { nonceInMarkup: false });
  await page.goto(ORIGIN + "/csp/tree.html");
  await expect.poll(async () => (await report.violations()).length).toBeGreaterThan(0);
});

test("a part file inserted with a wrong page nonce is refused, so the runtime's own nonce is what lets part files in", async ({ page }) => {
  const report = await serve(page, POLICIES["nonce only"]);
  // CanopyX.setNonce runs as the runtime defines its global, before the first view mounts and loads the tree tools file.
  await page.addInitScript(() => {
    let value;
    Object.defineProperty(window, "CanopyX", { configurable: true, get: () => value, set: runtime => { value = runtime; runtime.setNonce("d3JvbmdOb25jZQ=="); } });
  });
  await page.goto(ORIGIN + "/csp/bundle/index.html");
  await expect.poll(async () => (await report.violations()).join("\n")).toContain("canopyx-tree-tools");
});

test("a data block shaped like a part never runs, also under 'strict-dynamic'", async ({ page }) => {
  // The injected block comes first in the document, in the inert form older pages used, with the export part's real version.
  const inject = html => {
    const version = html.match(/<script data-canopyx-part="export" data-cx-version="([a-f0-9]{16})"/)?.[1];
    if (!version) throw new Error("The tree page carries no export part to imitate.");
    return html.replace('<main class="cx-main">', '<main class="cx-main"><script type="application/x-canopyx-export" data-cx-version="' + version + '">window.__injected = true;</script>');
  };
  const report = await serve(page, nonce => POLICIES["nonce only"](nonce).replace("script-src", "script-src 'strict-dynamic'"), { transform: inject });
  await open(page, "tree.html");
  await page.locator(".cx-host").getByText("Export", { exact: true }).click();
  await expect(page.getByRole("button", { name: /CSV/ }).first()).toBeVisible();
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  await expectClean(page, report);
});

test("an injected stylesheet shaped like a part's is never the one the page keeps", async ({ page }) => {
  // The policy refuses the injected element; the part adopts the nonced stylesheet beside its own script.
  const inject = html => {
    const version = html.match(/<style data-canopyx-part="tree-tools" data-cx-version="([a-f0-9]{16})"/)?.[1];
    if (!version) throw new Error("The tree page carries no tree tools stylesheet to imitate.");
    return html.replace('<main class="cx-main">', '<main class="cx-main"><style data-canopyx-part="tree-tools" data-cx-version="' + version + '" media="not all" data-canopyx-template>.cx-host{outline:9px solid red}</style>');
  };
  const report = await serve(page, POLICIES["nonce only"], { transform: inject });
  await open(page, "tree.html");
  await expect(page.locator(".cx-host").first()).toHaveClass(/cx-tree-tools/);
  const kept = await page.evaluate(() => [...document.head.querySelectorAll('style[data-canopyx-part="tree-tools"]')].map(style => ({ nonce: style.nonce !== "", injected: style.textContent.includes("9px solid red") })));
  expect(kept).toEqual([{ nonce: true, injected: false }]);
  expect((await report.violations()).every(violation => violation.startsWith("style-src"))).toBe(true);
});

test.describe("under require-trusted-types-for 'script'", () => {
  test("a tree writes its html detail, icons and parts through the canopyx policy", async ({ page }) => {
    const report = await serve(page, TRUSTED_TYPES);
    await open(page, "tree.html");
    await exerciseTree(page);
    await expectClean(page, report);
    // Without the policy, the same markup sink is refused: the page really enforces Trusted Types.
    const refused = await page.evaluate(() => { try { document.createElement("div").innerHTML = "<b>x</b>"; return false; } catch (error) { return error instanceof TypeError; } });
    expect(refused).toBe(true);
  });

  test("a grid, the interactive tree, a bundle and shared fragments load every part through the canopyx policy", async ({ page }) => {
    const report = await serve(page, TRUSTED_TYPES);
    await open(page, "grid.html");
    await exerciseGrid(page);
    await open(page, "interactive.html");
    await page.locator(".cx-check").first().click();
    await open(page, "bundle/index.html");
    await page.getByRole("combobox").fill("budget");
    await expect(page.getByRole("option").first()).toBeVisible();
    await open(page, "fragments.html");
    await exerciseGrid(page);
    await expectClean(page, report);
  });

  test("rich cells are sanitised and built under the policy, with the group footer rows and footer text", async ({ page }) => {
    const report = await serve(page, TRUSTED_TYPES);
    await open(page, "grid-content.html");
    const host = page.locator(".cx-host").first();
    await expect(host.locator(".cx-rich span.badge").first()).toHaveText(/Enabled|Disabled/);
    await expect(host.locator(".cx-rich a[target=_blank][rel='noopener noreferrer']").first()).toHaveAttribute("href", /^https:\/\/example\.test\/accounts\//);
    await expect(host.locator(".cx-grid-group-footer").first()).toContainText("accounts");
    await expect(host.locator('[data-cx-footer="total"]')).toContainText("Logons are counted for the last 30 days.");
    await expectClean(page, report);
  });

  test("a sanitizeHtml host option that returns TrustedHTML from its own policy is written without the canopyx policy", async ({ page }) => {
    const report = await serve(page, nonce => POLICIES["nonce only"](nonce) + "; require-trusted-types-for 'script'; trusted-types canopyx host");
    // Counts the HTML the canopyx policy is asked for.
    await page.addInitScript(() => {
      window.__canopyxHtml = 0;
      const create = trustedTypes.createPolicy.bind(trustedTypes);
      trustedTypes.createPolicy = (name, rules) => create(name, name === "canopyx" ? { ...rules, createHTML: text => (window.__canopyxHtml++, rules.createHTML(text)) } : rules);
    });
    await page.goto(ORIGIN + "/csp/tree.html");
    await page.waitForSelector("[data-cx-ready]");
    const result = await page.evaluate(async () => {
      const policy = trustedTypes.createPolicy("host", { createHTML: text => text.replace(/<strong>/g, "<em>").replace(/<\/strong>/g, "</em>") });
      const seed = document.querySelector("[data-canopyx-host]"), view = JSON.parse(seed.querySelector("script.cx-config").textContent);
      // A repaint of the original tree must not contribute to this host's policy counter.
      await seed.canopyx.ready; seed.canopyx.destroy(); seed.remove();
      const host = document.createElement("div");
      host.style.height = "300px";
      document.body.appendChild(host);
      const calls = [], before = window.__canopyxHtml;
      const api = CanopyX.createTreeGrid(host, { view: { ...view, id: "sanitized", stateKey: undefined, deepLink: false },
        sanitizeHtml: (html, context) => { calls.push(context.kind); return policy.createHTML(html); } });
      await api.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { calls: [...new Set(calls)].sort(), em: host.querySelector(".csp-note em")?.textContent, strong: !!host.querySelector(".csp-note strong"), canopyxHtml: window.__canopyxHtml - before };
    });
    expect(result).toEqual({ calls: ["detail", "icon"], em: "host", strong: false, canopyxHtml: 0 });
    await expectClean(page, report);
  });
});
