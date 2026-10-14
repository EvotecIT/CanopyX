# CanopyX website

This folder builds [canopyx.dev](https://canopyx.dev) with PowerForge.Web.

```powershell
pwsh Website/build.ps1 -Serve
```

The live demos are generated during the pipeline by `tools/SiteDemos`, which uses the CanopyX .NET API. See [AGENTS.md](AGENTS.md) for the workflow and validation steps.
