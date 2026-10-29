// Repository-specific Quality coverage. No package installation is needed for the planning job.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function requiresBuild(event, paths) {
  if (event !== "pull_request" || paths.length === 0) return true;
  return paths.some(file => file.startsWith("docs/schema/") ||
    !(file.startsWith("Website/") || file.startsWith("docs/") || file.endsWith(".md")));
}

export function qualityMatrix(event) {
  const include = [];
  for (const platform of [
    { name: "Linux", runner: "ubuntu-24.04" },
    { name: "Windows", runner: "windows-2025" },
    { name: "macOS", runner: "macos-15" }
  ]) {
    for (const engine of ["chromium", "firefox", "webkit"]) {
      if (event === "pull_request" && platform.name !== "Linux" &&
          engine !== (platform.name === "Windows" ? "chromium" : "webkit")) continue;
      // Keep the existing full-matrix shards. Three workers let PR WebKit run in one macOS job.
      const sharded = event !== "pull_request" &&
        ((platform.name === "Windows" && engine === "firefox") ||
         (platform.name === "macOS" && engine === "webkit"));
      for (const shard of sharded ? [1, 2] : [null]) {
        include.push({ platform, engine, ...(shard ? { shard } : {}) });
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
  appendFileSync(process.env.GITHUB_OUTPUT,
    `build=${build}\nmatrix=${JSON.stringify(qualityMatrix(event))}\n`);
  console.log(build ? "Build and browser coverage required." : "Only Website, documentation or Markdown changed; matrix skipped.");
}
