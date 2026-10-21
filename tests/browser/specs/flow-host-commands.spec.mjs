// The equivalent command (docs/flow.md#the-equivalent-command): every case of tests/fixtures/flow-commands.json, which C#
// (FlowCommandFixtureTests) runs too, written by the browser from the case's document, answers and typed secrets.
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { openFlow, waitForFlow } from "./flow-support.mjs";

const FIXTURE = JSON.parse(fs.readFileSync(new URL("../../fixtures/flow-commands.json", import.meta.url), "utf8"));

for (const item of FIXTURE.cases) {
  test(`the command matches the shared fixture: ${item.name}`, async ({ page }) => {
    await openFlow(page, "flow-mail-checks.html");
    const flow = Object.assign({}, item.flow, item.initial ? { initial: item.initial } : {});
    await page.evaluate(([flow, values]) => {
      const old = document.querySelector("[data-canopyx-host]");
      old.canopyx.destroy(); old.remove();
      const host = document.createElement("div");
      host.setAttribute("data-canopyx-host", "");
      document.querySelector(".cx-main").prepend(host);
      window.__command = undefined;
      // The page's mock host answers the proposal; the spec reads its command on the way.
      host.addEventListener("canopyx:flowSubmit", event => { window.__command = event.detail.command; });
      window.CanopyX.createFlow(host, { flow, values });
    }, [flow, item.values]);
    await waitForFlow(page);
    for (const id of item.secrets) await page.locator(`[data-cx-field="${id}"] input`).fill("not-in-the-command-123");
    expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.submit())).toMatchObject({ status: "saved" });
    const command = await page.evaluate(() => window.__command);
    expect(command).toBe(item.command);
    expect(command).not.toContain("not-in-the-command-123");
  });
}
