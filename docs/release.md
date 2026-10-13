# Package publication

The JavaScript package publishes automatically after a pull request merges into
`main` and that commit passes **Quality**. The .NET packages use a separate manual,
signed deployment through PowerForge.

## Pull requests

Repository writers and maintainers can merge pull requests when Linux, Windows
and macOS Quality checks pass and review conversations are resolved. Normal
merges do not require an administrator or a bypass. Direct pushes to `main` are
restricted by the pull-request requirement.

## Automatic npm releases

**Publish npm package** runs after a successful main-branch Quality run. It:

1. Reserves one three-part npm version for the qualified source commit.
2. Rebuilds the packages and checks the JavaScript distribution and its consumer.
3. Publishes the qualified archive using GitHub OIDC and npm trusted publishing.
4. Verifies the public archive's integrity and creates a GitHub release record.

The `npm-v` tags record npm versions independently of manual NuGet releases.
The version in `package.json` is the minimum release version. If it is already
published or reserved, PowerForge selects the next patch above the highest known
version. Raise that minimum in a PR to start a new minor or major version line.
The selected version is written into the package in the release workspace;
the workflow does not push a version-only commit or open another PR.
README screenshots are included in the archive and served through public,
versioned npm CDN URLs. Packaging updates those URLs to the selected npm version
so the npm page does not rely on access to this repository.

A tag reserves a version; it does not prove publication. Retrying the same source
commit reuses its reservation. If the package is already public, its integrity
must match the qualified archive before the retry succeeds without another upload.
Network errors and conflicting bytes stop publication.

The workflow also supports manual recovery or a dry run. Run it on `main` with
the successful main-branch Quality run ID for the same commit. Leave `version`
blank to use automatic selection, or specify a new three-part version.
`publish: false` checks the package without reserving a new tag or uploading.

The trusted-publisher connection for `@evotecit/canopyx` uses:

| Setting | Value |
| --- | --- |
| GitHub organization | `EvotecIT` |
| Repository | `CanopyX` |
| Calling workflow | `publish-npm.yml` |
| GitHub environment | `npm-release` |
| Allowed action | Direct `npm publish` |

The environment allows only the exact `main` branch. The shared publisher verifies
that policy, the successful Quality run, the source commit and the archive before
uploading. No stored npm token or bootstrap secret is used.

Public source repositories support npm provenance. npm does not support provenance
from private source repositories, so this repository disables it explicitly while
still verifying public archive integrity.

## Manual NuGet deployment

Set `CanopyXProductVersion` in `Directory.Build.props` for the .NET release and
run the quality loop. Both .NET packages use this version; npm's automatic patch
releases do not change it.

`Build/Build-Project.ps1` invokes PowerForge using `Build/project.build.json`.
After qualification, publish the chosen version explicitly:

```powershell
./Build/Build-Project.ps1 -Build $true -PublishNuget $true -UpdateVersions $false -PublishGitHub $false -Plan $false
```

The configuration owns package IDs, signing and credential-file locations.
Keep signing material on the approved publisher workstation. Do not copy a
private signing key or NuGet credential to a general CI runner.

After an accepted upload, wait for NuGet validation and indexing, then verify the
public packages and a fresh consumer. Do not repeat uploads to address indexing
delays. The automatic npm workflow never publishes NuGet packages.
