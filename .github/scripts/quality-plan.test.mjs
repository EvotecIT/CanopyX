import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { changedPaths, qualityMatrix, requiresBuild } from "./quality-plan.mjs";

test("only documentation and Website PRs skip builds; schemas and mixed changes require coverage", () => {
  assert.equal(requiresBuild("pull_request", ["Website/src/index.html", "docs/testing.md", "README.md", "nested/NOTES.md"]), false);
  for (const file of ["docs/schema/canopyx-2.schema.json", "docs/schema/README.md", "CanopyX/Node.cs", ".github/workflows/quality.yml", "tests/browser/specs/grid.spec.mjs"]) {
    assert.equal(requiresBuild("pull_request", ["README.md", file]), true, file);
  }
  assert.equal(requiresBuild("pull_request", []), true);
  for (const event of ["push", "schedule", "workflow_dispatch"]) {
    assert.equal(requiresBuild(event, ["README.md"]), true, event);
  }
});

test("PR coverage keeps every Linux engine, Windows visuals and packing, and one unsharded macOS WebKit job", () => {
  const jobs = qualityMatrix("pull_request").include;
  assert.deepEqual(jobs.map(job => [job.platform.name, job.engine, job.shard]), [
    ["Linux", "chromium", undefined], ["Linux", "firefox", undefined], ["Linux", "webkit", undefined],
    ["Windows", "chromium", undefined], ["macOS", "webkit", undefined]
  ]);
  assert.deepEqual(jobs.map(job => job.platform.runner), ["ubuntu-24.04", "ubuntu-24.04", "ubuntu-24.04", "windows-2025", "macos-15"]);
});

test("main, nightly and manual coverage keep every OS and engine and the existing two shard pairs", () => {
  for (const event of ["push", "schedule", "workflow_dispatch"]) {
    const jobs = qualityMatrix(event).include;
    assert.equal(jobs.length, 11, event);
    for (const platform of ["Linux", "Windows", "macOS"]) {
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
    commit();
    const base = git("rev-parse", "HEAD");
    mkdirSync(path.join(cwd, "docs"));
    git("mv", "runtime.js", "docs/runtime.md");
    git("rm", "deleted.js");
    commit();
    writeFileSync(path.join(cwd, "docs", "space ü.md"), "docs");
    commit();
    const files = changedPaths(base, "HEAD", cwd);
    assert.deepEqual(files.sort(), ["deleted.js", "docs/runtime.md", "docs/space ü.md", "runtime.js"].sort());
    assert.equal(requiresBuild("pull_request", files), true);
    assert.equal(requiresBuild("pull_request", changedPaths("HEAD~1", "HEAD", cwd)), false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
