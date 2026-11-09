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

// Pushes to main and manual runs cover every OS and engine; PRs cover the lanes selected above. Each lane runs in
// enough deterministic shards (tests/browser/tools/shards.mjs) to keep its browser tests near a quarter of an hour on
// three workers. The first job of each platform also runs the .NET suites and the engine-independent checks; the first
// Chromium job of each platform packs.
const shards = {
  "Linux/chromium": 2, "Linux/firefox": 3, "Linux/webkit": 3,
  "Windows/chromium": 3, "Windows/firefox": 4, "Windows/webkit": 3,
  "macOS/chromium": 2, "macOS/firefox": 3, "macOS/webkit": 4
};
const prLanes = new Set(["Linux/chromium", "Linux/firefox", "Linux/webkit", "Windows/chromium", "macOS/webkit"]);

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
      if (pr && (!prLanes.has(key) || (!allEngines && engine !== "chromium"))) continue;
      for (let shard = 1; shard <= shards[key]; shard++) {
        const suites = !include.some(job => job.platform.name === platform.name);
        const pack = engine === "chromium" && shard === 1;
        include.push({ platform, engine, shard, shards: shards[key], suites, pack });
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
