// Captures the README gallery from a built site through the existing HtmlTinkerX browser helper.
// pwsh Website/build.ps1
// node tests/browser/readme-images.mjs <site URL> [view IDs...]
// Uses installed Edge by default; CANOPYX_BROWSER_CHANNEL selects another installed Chromium channel.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('../BrowserInstall/BrowserInstall.csproj', import.meta.url));
const output = fileURLToPath(new URL('../../docs/images/views/', import.meta.url));
const [site = 'http://127.0.0.1:8091', ...views] = process.argv.slice(2);
const result = spawnSync('dotnet', ['run', '--project', project, '-c', 'Release', '--', '--readme-images', site, output, ...views], {
  stdio: 'inherit', env: { ...process.env, MSBUILDDISABLENODEREUSE: '1', DOTNET_CLI_USE_MSBUILD_SERVER: '0' }
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
