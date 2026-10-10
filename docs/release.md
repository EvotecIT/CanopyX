# Package publication

CanopyX uses one product version for the .NET and JavaScript packages. Change
`CanopyXProductVersion` in `Directory.Build.props` and `version` in `package.json`
together. The quality loop validates both distributions and their isolated
consumers before release.

## NuGet

`Build/Build-Project.ps1` invokes the shared PowerForge project publisher with
`Build/project.build.json`. Use its explicit `PublishNuget` option after the
release qualification gates pass. Keep `UpdateVersions` false when publishing
the already-qualified product version. The configuration owns the package IDs,
signing settings and credential-file locations.

## npm

Run the **Publish npm package** workflow on `main`, using the existing product
version and the successful main-branch **Quality** run ID for that exact commit.
The workflow rebuilds through `Build.ps1`, checks the JavaScript consumer, and
passes one archive and its SHA256 to PowerForge's shared npm publisher. Browser
qualification comes from the supplied full Quality run.

`publish: false` performs a dry run. `publish: true` publishes the same archive,
then verifies its public integrity and provenance. The workflow does not bump
versions, create tags or publish NuGet packages.

Configure the npm trusted publisher for `@evotecit/canopyx` with:

| Setting | Value |
| --- | --- |
| GitHub organization | `EvotecIT` |
| Repository | `CanopyX` |
| Calling workflow | `publish-npm.yml` |
| Allowed action | Direct `npm publish` |

npm requires the package to exist before configuring this relationship. For the
first qualified release, a package owner creates a short-lived granular npm token
with package-write permission for the `@evotecit` scope and bypass 2FA enabled for
unattended publication, then adds it to this repository
as the GitHub Actions secret `NPM_BOOTSTRAP_TOKEN`. Dispatch with `publish: true`
and `bootstrap: true`. The shared publisher requires the package to be absent
through an authenticated metadata check before uploading. The first upload runs
in GitHub Actions and includes provenance.

Remove the bootstrap secret after the first release. Later releases use
`bootstrap: false` and GitHub OIDC without a stored npm token. Configure trust close
to a release because an unused new configuration expires after two days. See
[npm's trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/) and
[Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).

If npm accepts an upload but registry verification fails, inspect the published
version before retrying. A version cannot be replaced with different bytes.
