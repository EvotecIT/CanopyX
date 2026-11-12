# Versions, compatibility and deprecation

CanopyX ships four NuGet packages (`CanopyX`, `CanopyX.Html`, `CanopyX.Data`, `CanopyX.AspNetCore`) and one npm package
(`@evotecit/canopyx`). The four NuGet packages use one aligned SDK version. The npm publisher selects its own next patch
version after the matching `main` quality run passes, so its version can differ from the SDK version. Both release paths
select the next version automatically.

## Matching an npm version to a NuGet version

There is no fixed mapping between the two numbers: CanopyX.Html 0.3.3 and @evotecit/canopyx 0.3.18 can carry the same runtime,
or not. Compare what they ship instead:

- **Runtime content.** `CanopyHtmlAssets.ScriptHash` is the first 16 hex digits of the SHA-256 of the embedded `canopyx.js`.
  Hash the package's `CanopyX.Html/Assets/canopyx.js` the same way; equal hashes mean the same runtime. Each lazy part's
  `version` in `canopyx-parts.json` (`CanopyHtmlAssets.GetPart(name).Version` in .NET) is its own content version, so a part
  such as `ui-overlays` can be compared on its own.
- **Source commit.** Every npm release has an `npm-v<version>` tag on the commit it was built from
  ([Automatic npm releases](release.md#automatic-npm-releases)). A NuGet release's version is committed to `main` after
  publication, so the commit that sets `<Version>` in `CanopyX.Html.csproj` is the NuGet side. The later of the two commits
  holds everything the earlier one has.

## What a version number promises

Versions follow semantic versioning: `MAJOR.MINOR.PATCH`.

| Change | Before 1.0 | From 1.0 |
| --- | --- | --- |
| Bug fix, no API change | patch | patch |
| New API, option, label or part (additive) | minor | minor |
| A removed or renamed public member, a changed signature or meaning, a stricter check that refuses input accepted before | minor, with a migration note | major |
| A wire protocol change a reader of the previous version cannot read | a new protocol version (`canopyx/3`) | a new protocol version and a major release |

Before 1.0 a cleaner design may replace an API in a minor release (see `AGENTS.md`); the release notes then say what to change.
The wire protocol is separate from package versions: additive optional fields stay in `canopyx/2`, and readers ignore fields
they do not know ([data-protocol.md](data-protocol.md#versioning)).

## The public API is checked

Every public type and member of the .NET packages, and every declaration file the npm package ships, is written to a baseline
under `api/`:

- `api/CanopyX.txt`, `api/CanopyX.Html.txt`, `api/CanopyX.Data.txt` and `api/CanopyX.AspNetCore.txt`: the .NET API (as built
  for .NET 10), checked by the API tests (`ApiSurfaceTests` in `CanopyX.Tests` and `CanopyX.Data.Tests`), which run with every
  `dotnet test`.
- `api/canopyx.d.ts.txt`: the TypeScript API, every declaration file the npm package ships without its comments, checked by
  `tests/browser/tools/api-report.mjs` (`npm run test:api`).
- `api/canopyx-roles.txt`: the shared `--hfx-*` design roles the runtime stylesheets read, which is the contract a host defines
  to theme CanopyX ([Theming](architecture.md#theming)). It is checked by `Build/Lint-DesignTokens.mjs`. A new role is additive;
  a removed role, or one read with a different meaning, follows the same rules as a removed or changed member.

`Build.ps1` runs all of them, so the quality workflow fails on an unacknowledged change.

A change to the public surface fails the build until its baseline is updated in the same pull request, so every API change is
visible in review:

```powershell
$env:CANOPYX_API_UPDATE = "1"; dotnet test CanopyX.sln -c Release; node Build/Lint-DesignTokens.mjs; $env:CANOPYX_API_UPDATE = $null
npm run test:api:update --prefix tests/browser
```

Review the difference before committing it: an added line is a new API; a removed or changed line is a breaking change that
needs the treatment below.

## Deprecating an API

1. Mark it: `[Obsolete("Use X instead. Removal planned for version N.")]` in C#, `/** @deprecated Use X instead. */` in the
   TypeScript declarations. Name the replacement and the version that removes it.
2. Keep it working for at least one minor release (from 1.0: until the next major release).
3. Say so in the release notes and in the feature's page under `docs/`.
4. Remove it in the announced version, with a short migration note.

Labels, view document fields and runtime options follow the same rule. A label key or document field is never reused with
another meaning.

## Supported toolchains

`CanopyX`, `CanopyX.Html` and `CanopyX.Data` target .NET Framework 4.7.2, .NET Standard 2.0, .NET 8 and .NET 10;
`CanopyX.AspNetCore` targets .NET 8 and .NET 10. Dropping a target is a breaking change. The TypeScript declarations are checked
with a strict consumer on every build; the runtime itself needs no build step.
