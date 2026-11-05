// Repository-specific Quality coverage. No package installation is needed for the planning job.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// NuGet package READMEs and the npm archive's Markdown inputs remain part of packaging validation.
const packageReadmes = new Set([
  "README.md", "README.nuget.md", "CanopyX.Data/README.md", "CanopyX.AspNetCore/README.md",
  "ThirdParty/OfficeIMO/README.md"
]);

export function requiresBuild(event, paths) {
  if (event !== "pull_request" || paths.length === 0) return true;
  return paths.some(file => packageReadmes.has(file) || file.startsWith("docs/images/") || file.startsWith("docs/schema/") ||
    !(file.startsWith("Website/") || file.startsWith("docs/") || file.endsWith(".md")));
}

// Shared build inputs and the browser runtime keep the complete PR engine set. Other code changes keep the .NET suites
// and Chromium browser coverage on Linux and Windows (visual baselines, .NET Framework and packing).
export function requiresAllEngines(event, paths) {
  if (event !== "pull_request" || paths.length === 0) return true;
  return paths.some(file => file.startsWith(".github/") || file.startsWith("Build/") || file.startsWith("JavaScript/") ||
    file.startsWith("CanopyX.Html/Assets/") || file.startsWith("tests/browser/") || file.startsWith("tests/BrowserInstall/") ||
    /(^|\/)(Directory\.Build\.[^/]+|global\.json|package(-lock)?\.json|NuGet\.config|[^/]+\.sln)$/i.test(file) ||
    file === "Build.ps1");
}

// Pushes to main and manual runs keep every OS and engine with their existing shards. PRs split long browser suites into
// parallel shards so the slowest lane stays near half an hour.
const fullShards = { "Windows/firefox": 2, "macOS/webkit": 2 };
const prShards = { "Linux/chromium": 2, "Linux/firefox": 2, "Linux/webkit": 2, "Windows/chromium": 2, "macOS/webkit": 3 };

export function qualityMatrix(event, allEngines = true) {
  const pr = event === "pull_request";
  const include = [];
  for (const platform of [
    { name: "Linux", runner: "ubuntu-24.04" },
    { name: "Windows", runner: "windows-2025" },
    { name: "macOS", runner: "macos-15" }
  ]) {
    for (const engine of ["chromium", "firefox", "webkit"]) {
      const key = `${platform.name}/${engine}`;
      if (pr && !(key in prShards)) continue;
      if (pr && !allEngines && engine !== "chromium") continue;
      const shards = (pr ? prShards : fullShards)[key] || 0;
      for (const shard of shards ? Array.from({ length: shards }, (_, index) => index + 1) : [null]) {
        // One Chromium job per platform packs and uploads the packages and example pages.
        const pack = engine === "chromium" && (shard ?? 1) === 1;
        include.push({ platform, engine, pack, ...(shard ? { shard, shards } : {}) });
      }
    }
  }
  return { include };
}

export function changedPaths(base, head, cwd) {
  // Disable rename detection so moving code into docs cannot hide its deletion. NULs preserve unusual filenames.
  return execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`, "--"],
    { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).split("\0").filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = process.env.GITHUB_EVENT_NAME;
  const paths = event === "pull_request" ? changedPaths(process.env.BASE_SHA, process.env.HEAD_SHA) : [];
  const build = requiresBuild(event, paths);
  const allEngines = requiresAllEngines(event, paths);
  appendFileSync(process.env.GITHUB_OUTPUT,
    `build=${build}\nmatrix=${JSON.stringify(qualityMatrix(event, allEngines))}\n`);
  console.log(!build ? "Only Website, documentation or Markdown changed; matrix skipped." :
    allEngines ? "Build and every selected browser engine required." : "Library code changed; Chromium on Linux and Windows required.");
}
