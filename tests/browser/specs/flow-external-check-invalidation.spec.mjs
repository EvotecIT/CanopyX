import { test, expect } from "@playwright/test";
import { field } from "./flow-support.mjs";
import { mountRuntime, documentOf, checkedStep, reviewStep, deferredCheck } from "./flow-host-regression-support.mjs";

const item = (page, id) => page.locator(`.cx-flow-check-item[data-cx-check="${id}"]`);

for (const entry of ["flow-entry", "reporting"]) {
  test(`${entry}: external invalidation retires asynchronous submission validation`, async ({ page }, testInfo) => {
    const hooks = `({hooks:{check:async()=>({status:"pass"}),validateFlow:()=>new Promise(resolve=>{window.__validation=resolve;}),submit:async()=>({status:"saved"})}})`;
    expect(await mountRuntime(page, testInfo, documentOf([checkedStep, reviewStep]), hooks, entry)).toBeNull();
    await page.evaluate(() => window.__api.runCheck("test"));
    const before = await page.evaluate(() => [window.__api.getValues(), window.__api.isDirty()]);
    await page.evaluate(() => { window.__pending = window.__api.submit(); });
    await page.waitForFunction(() => typeof window.__validation === "function");
    await page.evaluate(() => { window.__api.invalidateChecks(["test"]); window.__validation({valid:true}); });
    expect(await page.evaluate(() => window.__pending)).toBeNull();
    expect(await page.evaluate(() => window.__submissions)).toEqual([]);
    expect(await page.evaluate(() => [window.__api.getValues(), window.__api.isDirty()])).toEqual(before);
  });

  test(`${entry}: external invalidation retires a pending submission and its secret reader`, async ({ page }, testInfo) => {
    const step = {...checkedStep,fields:[...checkedStep.fields,{id:"password",type:"secret",label:"Password"}]};
    const hooks = `({hooks:{check:async()=>({status:"pass"}),submit:detail=>new Promise(resolve=>{window.__submission={detail,resolve};})}})`;
    expect(await mountRuntime(page, testInfo, documentOf([step, reviewStep]), hooks, entry)).toBeNull();
    await field(page, "password").locator("input").fill("fixture-only-submission-password");
    await page.evaluate(() => window.__api.runCheck("test"));
    const before = await page.evaluate(() => [window.__api.getValues(), window.__api.isDirty()]);
    await page.evaluate(() => { window.__pending = window.__api.submit(); });
    await page.waitForFunction(() => !!window.__submission);
    const secret = await page.evaluate(() => {
      window.__api.invalidateChecks(["test"]);
      const value = window.__submission.detail.secret("password");
      window.__submission.resolve({status:"saved"}); return value;
    });
    expect(secret).toBeNull();
    expect(await page.evaluate(() => window.__pending)).toBeNull();
    expect(await page.evaluate(() => [window.__api.getValues(), window.__api.isDirty()])).toEqual(before);
  });

  test(`${entry}: flows without checks reject invalidation after another flow loads the part`, async ({ page }, testInfo) => {
    expect(await mountRuntime(page, testInfo, documentOf([checkedStep]), "({})", entry)).toBeNull();
    const result = await page.evaluate(async flow => {
      const host=document.createElement("main");document.body.append(host);
      const api=window.CanopyX.createFlow(host,{flow});await api.ready;
      let rejected=false;try{api.invalidateChecks();}catch{rejected=true;}
      api.setValues({name:"changed"});
      return {rejected,value:api.getValues().name};
    }, documentOf([{id:"plain",title:"Answers",fields:checkedStep.fields}],{id:"no-checks"}));
    expect(result).toEqual({rejected:true,value:"changed"});
  });

  test(`${entry}: external invalidation preserves evidence and values while retiring only the named checks`, async ({ page }, testInfo) => {
    const step = { ...checkedStep, checks: [...checkedStep.checks, { ...checkedStep.checks[0], id: "second", label: "Second" }] };
    const hooks = `({hooks:{check:async id=>({status:"pass",message:"Evidence for "+id,details:[{label:"Target",value:"fixture"}]})}})`;
    expect(await mountRuntime(page, testInfo, documentOf([step, reviewStep]), hooks, entry)).toBeNull();
    await page.evaluate(() => Promise.all([window.__api.runCheck("test"), window.__api.runCheck("second")]));
    const values = await page.evaluate(() => window.__api.getValues());
    const invalid = await page.evaluate(() => { try { window.__api.invalidateChecks(["test", "missing"]); } catch (error) { return error.message; } });
    expect(invalid).toContain("existing check ids");
    await expect(item(page, "test")).toHaveAttribute("data-cx-state", "pass");
    await page.evaluate(() => window.__api.invalidateChecks([]));
    await expect(item(page, "test")).toHaveAttribute("data-cx-state", "pass");
    await page.evaluate(() => window.__api.invalidateChecks(["test"]));
    await expect(item(page, "test")).toHaveAttribute("data-cx-state", "stale");
    await expect(item(page, "test")).toContainText("Evidence for test");
    await expect(item(page, "second")).toHaveAttribute("data-cx-state", "pass");
    expect(await page.evaluate(() => window.__api.getValues())).toEqual(values);
    expect(await page.evaluate(() => window.__api.isDirty())).toBe(false);
    expect((await page.evaluate(() => window.__api.validate())).valid).toBe(false);
    expect(await page.evaluate(() => window.__api.submit())).toBeNull();
    expect(await page.evaluate(() => window.__submissions)).toEqual([]);
    await page.evaluate(() => window.__api.runCheck("test"));
    expect((await page.evaluate(() => window.__api.validate())).valid).toBe(true);
    await page.evaluate(() => window.__api.invalidateChecks());
    await expect(page.getByRole("region", { name: "Checks", exact: true }).getByText("The answers changed since the check", { exact: true })).toHaveCount(2);
    expect((await page.evaluate(() => window.__api.validate())).valid).toBe(false);
  });

  test(`${entry}: invalidation cancels a pending check, revokes its secret and ignores a late answer`, async ({ page }, testInfo) => {
    const step = { ...checkedStep, fields: [...checkedStep.fields, { id: "password", type: "secret", label: "Password" }],
      checks: [{ ...checkedStep.checks[0], fields: ["name", "password"] }] };
    expect(await mountRuntime(page, testInfo, documentOf([step, reviewStep]), deferredCheck, entry)).toBeNull();
    await field(page, "password").locator("input").fill("fixture-only-password");
    await page.evaluate(() => { window.__pending = window.__api.runCheck("test"); });
    await page.waitForFunction(() => window.__checks?.length === 1);
    await page.evaluate(() => window.__api.invalidateChecks(["test"]));
    expect(await page.evaluate(() => window.__checks[0].context.signal.aborted)).toBe(true);
    expect(await page.evaluate(() => window.__checks[0].context.secret("password"))).toBeNull();
    await expect(item(page, "test").getByRole("button", { name: "Test", exact: true })).toBeEnabled();
    await page.evaluate(() => { window.__fresh = window.__api.runCheck("test"); });
    await page.waitForFunction(() => window.__checks.length === 2);
    await page.evaluate(() => window.__checks[1].resolve({ status: "pass", message: "Current evidence" }));
    await page.evaluate(() => window.__fresh);
    await page.evaluate(() => window.__checks[0].resolve({ status: "fail", message: "Obsolete answer" }));
    expect(await page.evaluate(() => window.__pending)).toBeNull();
    await expect(item(page, "test")).toHaveAttribute("data-cx-state", "pass");
    await expect(item(page, "test")).toContainText("Current evidence");
    await expect(item(page, "test")).not.toContainText("Obsolete answer");
    expect(await page.evaluate(() => [window.__errors, window.__rejections])).toEqual([[], []]);
  });
}
