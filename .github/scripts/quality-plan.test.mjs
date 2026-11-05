import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { changedPaths, qualityMatrix, requiresAllEngines, requiresBuild } from "./quality-plan.mjs";

test("only documentation and Website PRs skip builds; schemas and mixed changes require coverage", () => {
  assert.equal(requiresBuild("pull_request", ["Website/src/index.html", "docs/testing.md", "CONTRIBUTING.md", "nested/NOTES.md"]), false);
  for (const file of ["docs/schema/canopyx-2.schema.json", "docs/schema/README.md", "CanopyX/Node.cs", ".github/workflows/quality.yml", "tests/browser/specs/grid.spec.mjs"]) {
    assert.equal(requiresBuild("pull_request", ["README.md", file]), true, file);
  }
  assert.equal(requiresBuild("pull_request", []), true);
  for (const event of ["push", "workflow_dispatch"]) {
    assert.equal(requiresBuild(event, ["README.md"]), true, event);
  }
});

test("shipped package READMEs and images require pack and archive validation", () => {
  for (const file of ["README.md", "README.nuget.md", "CanopyX.Data/README.md", "CanopyX.AspNetCore/README.md",
    "ThirdParty/OfficeIMO/README.md", "docs/images/tree-grid-light.png", "docs/images/new-example.png"]) {
    assert.equal(requiresBuild("pull_request", [file]), true, file);
    assert.equal(requiresBuild("pull_request", ["docs/testing.md", file]), true, file);
  }
});

test("browser runtime and shared build inputs keep every PR engine, sharded, with one packing job per platform", () => {
  for (const file of ["CanopyX.Html/Assets/canopyx.source/10-core.js", "tests/browser/specs/grid.spec.mjs", "JavaScript/index.d.ts",
    ".github/workflows/quality.yml", "Directory.Build.props", "tests/browser/package-lock.json", "Build.ps1", "Build/Sync-Assets.ps1"]) {
    assert.equal(requiresAllEngines("pull_request", ["CanopyX/Node.cs", file]), true, file);
  }
  const jobs = qualityMatrix("pull_request", true).include;
  const lanes = jobs.map(job => `${job.platform.name}/${job.engine}/${job.shard}/${job.shards}`);
  assert.deepEqual(lanes, ["Linux/chromium/1/2", "Linux/chromium/2/2", "Linux/firefox/1/2", "Linux/firefox/2/2",
    "Linux/webkit/1/2", "Linux/webkit/2/2", "Windows/chromium/1/2", "Windows/chromium/2/2",
    "macOS/webkit/1/3", "macOS/webkit/2/3", "macOS/webkit/3/3"]);
  assert.deepEqual(jobs.filter(job => job.pack).map(job => `${job.platform.name}/${job.shard}`), ["Linux/1", "Windows/1"]);
});

test("other code PRs keep Chromium on Linux and Windows", () => {
  assert.equal(requiresAllEngines("pull_request", ["CanopyX/Node.cs", "CanopyX.Data/Query.cs", "docs/testing.md"]), false);
  const jobs = qualityMatrix("pull_request", false).include;
  assert.deepEqual(jobs.map(job => `${job.platform.name}/${job.engine}/${job.shard}`),
    ["Linux/chromium/1", "Linux/chromium/2", "Windows/chromium/1", "Windows/chromium/2"]);
});

test("main pushes and manual coverage keep every OS and engine and the existing two shard pairs", () => {
  for (const event of ["push", "workflow_dispatch"]) {
    const jobs = qualityMatrix(event).include;
    assert.equal(jobs.length, 11, event);
    for (const platform of ["Linux", "Windows", "macOS"]) {
      assert.equal(jobs.filter(job => job.platform.name === platform && job.pack).length, 1, `${event}/${platform} pack`);
      for (const engine of ["chromium", "firefox", "webkit"]) {
        const shards = jobs.filter(job => job.platform.name === platform && job.engine === engine).map(job => job.shard);
        assert.deepEqual(shards, (platform === "Windows" && engine === "firefox") ||
          (platform === "macOS" && engine === "webkit") ? [1, 2] : [undefined], `${event}/${platform}/${engine}`);
      }
    }
  }
});

test("the complete PR diff includes earlier commits, code moved into docs, deletions and unusual filenames", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "canopyx-quality-plan-"));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const commit = () => { git("add", "."); git("-c", "user.name=Quality test", "-c", "user.email=quality@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"); };
  try {
    git("init", "-q");
    writeFileSync(path.join(cwd, "runtime.js"), "runtime");
    writeFileSync(path.join(cwd, "deleted.js"), "obsolete");
    writeFileSync(path.join(cwd, "README.nuget.md"), "package readme");
    commit();
    const base = git("rev-parse", "HEAD");
    mkdirSync(path.join(cwd, "docs"));
    git("mv", "runtime.js", "docs/runtime.md");
    git("rm", "deleted.js");
    commit();
    git("mv", "README.nuget.md", "docs/package-guide.md");
    commit();
    writeFileSync(path.join(cwd, "docs", "space ü.md"), "docs");
    commit();
    const files = changedPaths(base, "HEAD", cwd);
    assert.deepEqual(files.sort(), ["deleted.js", "docs/runtime.md", "docs/space ü.md", "runtime.js", "README.nuget.md", "docs/package-guide.md"].sort());
    assert.equal(requiresBuild("pull_request", files), true);
    const movedReadme = changedPaths("HEAD~2", "HEAD~1", cwd);
    assert.deepEqual(movedReadme.sort(), ["README.nuget.md", "docs/package-guide.md"]);
    assert.equal(requiresBuild("pull_request", movedReadme), true);
    assert.equal(requiresBuild("pull_request", changedPaths("HEAD~1", "HEAD", cwd)), false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
