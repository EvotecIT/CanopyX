// Runs a command and watches its output for a stall. Playwright closes each worker's browser without a deadline (its
// browser fixture has timeout 0), and the worker keeps sending heartbeats while it waits, so a browser.close() that never
// returns holds the whole run until the CI job's deadline. That has happened with WebKit on Windows, at the end of a
// run or when a worker restarts for a spec file with its own launch options: every test had reported, nothing else did.
// When the command prints nothing for the stall limit (several test timeouts), the watchdog lists the Playwright browser
// processes started since the run began and, on Windows, stops them, which lets the pending close finish; the results
// already reported stand. If the run stays silent for another stall period, the watchdog ends it and reports a failure.
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

/** Where Playwright keeps its browsers, as Playwright resolves it. */
export function browsersRoot(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== "0") return path.resolve(env.PLAYWRIGHT_BROWSERS_PATH);
  if (platform === "win32") return path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "ms-playwright");
  if (platform === "darwin") return path.join(home, "Library", "Caches", "ms-playwright");
  return path.join(env.XDG_CACHE_HOME || path.join(home, ".cache"), "ms-playwright");
}

/** The stall limit in milliseconds: CANOPYX_TEST_STALL_SECONDS, five minutes by default. */
export function stallLimit(env = process.env) {
  const text = env.CANOPYX_TEST_STALL_SECONDS;
  if (text === undefined || text === "") return 300000;
  if (!/^[1-9]\d*$/.test(text)) throw new Error("CANOPYX_TEST_STALL_SECONDS must be a positive whole number of seconds.");
  return Number(text) * 1000;
}

function browserProcesses(root, since, stop) {
  if (process.platform === "win32") {
    const quote = text => "'" + text.replace(/'/g, "''") + "'";
    const script = `$since = [datetime]::Parse(${quote(since.toISOString())}).ToLocalTime(); ` +
      `$found = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith(${quote(root + path.sep)}, 'OrdinalIgnoreCase') -and $_.CreationDate -ge $since }; ` +
      `$found | ForEach-Object { '{0} (parent {1}) {2}' -f $_.ProcessId, $_.ParentProcessId, $_.ExecutablePath }; ` +
      (stop ? "$found | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" : "");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true });
    return (result.stdout || "") + (result.stderr || "");
  }
  // Elsewhere the listing is for the record only; the run has not stalled this way outside Windows.
  const result = spawnSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" });
  return (result.stdout || "").split("\n").filter(line => line.includes(root)).join("\n");
}

function killTree(child) {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
  else try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
}

/** Runs the command with its output passed through; resolves with its exit status (1 when the watchdog ended it). */
export function runWatched(command, args, options = {}) {
  const limit = options.stallMs ?? stallLimit(), root = options.browsersRoot ?? browsersRoot(), started = new Date();
  const log = options.log ?? (text => process.stderr.write(text + "\n"));
  const child = spawn(command, args, { ...options.spawn, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
  let stalls = 0, timer = null, ended = false;
  const arm = () => { clearTimeout(timer); timer = setTimeout(stalled, limit); };
  const stalled = () => {
    stalls++;
    const seconds = Math.round(limit / 1000);
    if (stalls === 1) {
      const listed = browserProcesses(root, started, process.platform === "win32").trim();
      log(`::warning::Browser tests printed nothing for ${seconds} s. Playwright browser processes started by this run:` +
        `\n${listed || "(none)"}\n${process.platform === "win32" ? "Stopped them so a pending browser close can finish." : ""}`);
      arm();
      return;
    }
    log(`::error::Browser tests are still silent ${seconds} s later; ending the run.`);
    ended = true; killTree(child);
  };
  for (const [stream, target] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    stream.on("data", chunk => { (options.output ?? target).write(chunk); stalls = 0; arm(); });
  }
  arm();
  const interrupt = () => killTree(child);
  process.once("SIGINT", interrupt);
  return new Promise(resolve => {
    child.on("error", error => { log(String(error)); });
    child.on("close", status => { clearTimeout(timer); process.off("SIGINT", interrupt); resolve(ended ? 1 : status ?? 1); });
  });
}
