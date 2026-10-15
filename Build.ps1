param(
    [ValidateSet('Debug', 'Release')]
    [string] $Configuration = 'Release',

    [switch] $SkipExamples,

    [switch] $SkipBrowserTests,

    [switch] $SkipPack,

    [ValidateRange(1, 86400)]
    [int] $DotNetCommandTimeoutSeconds = 900,

    [ValidateRange(1, 86400)]
    [int] $BrowserTestTimeoutSeconds = 900,

    [ValidateRange(1, 3600)]
    [int] $PackageConsumerTimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'

function Join-ProcessArguments {
    param(
        [Parameter(Mandatory = $true)] [string[]] $Arguments
    )

    $escaped = foreach ($argument in $Arguments) {
        if ($argument -match '^[A-Za-z0-9_./:\\=-]+$') {
            $argument
        } else {
            '"' + ($argument -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
        }
    }

    $escaped -join ' '
}

function Invoke-ToolCommand {
    param(
        [Parameter(Mandatory = $true)] [string] $FileName,
        [Parameter(Mandatory = $true)] [string[]] $Arguments,
        [Parameter(Mandatory = $true)] [string] $Description,
        [Parameter(Mandatory = $true)] [int] $TimeoutSeconds,
        [string] $WorkingDirectory = (Get-Location).ProviderPath,
        [switch] $PassThruOutput
    )

    $command = Get-Command $FileName -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) {
        throw "$Description requires '$FileName' to be available on PATH."
    }

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $command.Source
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = [bool] $PassThruOutput
    $startInfo.RedirectStandardError = [bool] $PassThruOutput
    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT -and [IO.Path]::GetExtension($command.Source) -in @(".cmd", ".bat")) {
        # Batch launchers need cmd, while package-manager executable shims run directly.
        $startInfo.FileName = Join-Path $env:SystemRoot "System32/cmd.exe"
        $startInfo.Arguments = '/d /s /c "' + (Join-ProcessArguments -Arguments (@($command.Source) + $Arguments)) + '"'
    } elseif ($null -ne $startInfo.ArgumentList) {
        foreach ($argument in $Arguments) {
            [void] $startInfo.ArgumentList.Add($argument)
        }
    } else {
        $startInfo.Arguments = Join-ProcessArguments -Arguments $Arguments
    }

    $process = [System.Diagnostics.Process]::Start($startInfo)
    $standardOutput = $null
    $standardError = $null
    if ($PassThruOutput) {
        $standardOutput = $process.StandardOutput.ReadToEndAsync()
        $standardError = $process.StandardError.ReadToEndAsync()
    }

    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        try {
            $process.Kill($true)
        } catch {
            $process.Kill()
        }

        throw "$Description timed out after $TimeoutSeconds second(s): $FileName $($Arguments -join ' ')"
    }

    if ($process.ExitCode -ne 0) {
        if ($PassThruOutput) {
            $tail = (($standardOutput.GetAwaiter().GetResult(), $standardError.GetAwaiter().GetResult()) -join [Environment]::NewLine).Trim()
            if ($tail.Length -gt 0) {
                throw "$Description failed with exit code $($process.ExitCode): $tail"
            }
        }

        throw "$Description failed with exit code $($process.ExitCode)."
    }

    if ($PassThruOutput) {
        return $standardOutput.GetAwaiter().GetResult().Trim()
    }
}

function Assert-SourceLineBudget {
    param(
        [Parameter(Mandatory = $true)] [string] $Root,
        [Parameter(Mandatory = $true)] [string[]] $ProjectFolders
    )

    # Source structure is a repository quality gate, not a product unit-test contract.
    foreach ($folder in $ProjectFolders) {
        $projectRoot = Join-Path $Root $folder
        $sources = Get-ChildItem -Path $projectRoot -Recurse -File -Filter '*.cs' |
            Where-Object { $_.FullName.Substring($projectRoot.Length) -notmatch '^[\\/](bin|obj)[\\/]' }
        foreach ($source in $sources) {
            if ([System.IO.File]::ReadAllLines($source.FullName).Length -gt 800) {
                throw "C# source exceeds the 800-line budget: $($source.FullName.Substring($Root.Length + 1))"
            }
        }
    }


}

function Invoke-PackageSmoke {
    param(
        [Parameter(Mandatory = $true)] [string] $Root,
        [Parameter(Mandatory = $true)] [string] $PackageRoot,
        [Parameter(Mandatory = $true)] [string] $Version,
        [Parameter(Mandatory = $true)] [int] $TimeoutSeconds
    )

    # A clean console app restores CanopyX.Html from the fresh packages only, with its own package cache so a stale or
    # published copy of the same version cannot hide a packing mistake.
    $consumerRoot = Join-Path ([System.IO.Path]::GetTempPath()) "CanopyX-package-smoke-$([Guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $consumerRoot | Out-Null
    try {
        # The nugetconfig template writes a lowercase nuget.config with <clear/> and one nuget.org source named "nuget".
        # Removing that source leaves the fresh local packages as the only feed.
        $config = Join-Path $consumerRoot 'nuget.config'
        Invoke-ToolCommand -FileName 'dotnet' -Arguments @('new', 'console', '--framework', 'net10.0', '--output', $consumerRoot, '--name', 'CanopyXSmoke', '--no-restore') -Description 'Package smoke project creation' -TimeoutSeconds $TimeoutSeconds -PassThruOutput | Out-Null
        Invoke-ToolCommand -FileName 'dotnet' -Arguments @('new', 'nugetconfig', '--output', $consumerRoot) -Description 'Package smoke NuGet configuration' -TimeoutSeconds $TimeoutSeconds -PassThruOutput | Out-Null
        Invoke-ToolCommand -FileName 'dotnet' -Arguments @('nuget', 'remove', 'source', 'nuget', '--configfile', $config) -Description 'Package smoke feed isolation' -TimeoutSeconds $TimeoutSeconds -PassThruOutput | Out-Null
        Invoke-ToolCommand -FileName 'dotnet' -Arguments @('nuget', 'add', 'source', $PackageRoot, '--name', 'local-canopyx', '--configfile', $config) -Description 'Package smoke local feed' -TimeoutSeconds $TimeoutSeconds -PassThruOutput | Out-Null
        Invoke-ToolCommand -FileName 'dotnet' -Arguments @('nuget', 'config', 'set', 'globalPackagesFolder', (Join-Path $consumerRoot '.packages'), '--configfile', $config) -Description 'Package smoke package cache' -TimeoutSeconds $TimeoutSeconds -PassThruOutput | Out-Null
        # RestorePackagesPath overrides an ambient NUGET_PACKAGES, which takes precedence over nuget.config.
        $cachePath = [System.Security.SecurityElement]::Escape((Join-Path $consumerRoot '.packages'))
        [System.IO.File]::WriteAllText((Join-Path $consumerRoot 'Directory.Build.props'), "<Project><PropertyGroup><RestorePackagesPath>$cachePath</RestorePackagesPath></PropertyGroup></Project>")
        Copy-Item -LiteralPath (Join-Path $Root 'Build/PackageSmoke/Program.cs') -Destination (Join-Path $consumerRoot 'Program.cs') -Force
        Invoke-ToolCommand -FileName 'dotnet' -Arguments @('add', (Join-Path $consumerRoot 'CanopyXSmoke.csproj'), 'package', 'CanopyX.Html', '--version', $Version) -WorkingDirectory $consumerRoot -Description 'Package smoke dependency restore' -TimeoutSeconds $TimeoutSeconds -PassThruOutput | Out-Null
        Invoke-ToolCommand -FileName 'dotnet' -Arguments @('run', '--project', (Join-Path $consumerRoot 'CanopyXSmoke.csproj'), '-c', 'Release') -WorkingDirectory $consumerRoot -Description 'Package smoke run' -TimeoutSeconds $TimeoutSeconds
    } finally {
        Remove-Item -LiteralPath $consumerRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Assert-RuntimeLineBudget {
    param([string] $Root)
    foreach ($source in @('canopyx.source', 'canopyx.interactive.source', 'canopyx.grid.source', 'canopyx.reporting.source', 'canopyx.tree-tools.source', 'canopyx.data.source')) {
        $parts = Join-Path $Root "CanopyX.Html/Assets/$source"
        if (!(Test-Path -LiteralPath $parts)) { continue }
        foreach ($part in Get-ChildItem -LiteralPath $parts -Filter '*.js' -File) {
            if ([System.IO.File]::ReadAllLines($part.FullName).Length -gt 350) {
                throw "Runtime source part exceeds the 350-line budget: $($part.Name)"
            }
        }
    }
}

function Assert-PackageContents {
    param(
        [Parameter(Mandatory = $true)] [string] $PackagePath,
        [Parameter(Mandatory = $true)] [string] $Assembly,
        [Parameter(Mandatory = $true)] [string] $Version,
        [Parameter(Mandatory = $true)] [AllowEmptyCollection()] [string[]] $DependencyIds,
        [string[]] $Frameworks = @('net472', 'netstandard2.0', 'net8.0', 'net10.0'),
        [AllowEmptyCollection()] [string[]] $LegacyDependencyIds = @()
    )

    $frameworks = $Frameworks
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($PackagePath)
    try {
        $entries = @($archive.Entries | ForEach-Object { $_.FullName })
        $required = @('README.md', "$Assembly.nuspec")
        foreach ($framework in $frameworks) {
            $required += "lib/$framework/$Assembly.dll"
            $required += "lib/$framework/$Assembly.xml"
        }
        foreach ($entry in $required) {
            if ($entries -notcontains $entry) {
                throw "$Assembly package is missing $entry."
            }
        }

        $nuspecEntry = $archive.Entries | Where-Object { $_.FullName -eq "$Assembly.nuspec" } | Select-Object -First 1
        $reader = [System.IO.StreamReader]::new($nuspecEntry.Open())
        try {
            [xml] $nuspec = $reader.ReadToEnd()
        } finally {
            $reader.Dispose()
        }

        # Every framework group must list exactly the expected CanopyX packages at the package's own version. Groups for
        # .NET Framework and .NET Standard may add the listed polyfill packages, which modern targets get from the runtime.
        $groups = @($nuspec.package.metadata.dependencies.group)
        if ($groups.Count -ne $frameworks.Count) {
            throw "$Assembly package has $($groups.Count) dependency groups, expected $($frameworks.Count)."
        }
        $expected = (@($DependencyIds | Sort-Object | ForEach-Object { "$_@$Version" }) -join ',')
        foreach ($group in $groups) {
            $dependencies = @($group.dependency | Where-Object { $_ })
            $legacy = $group.targetFramework -match '^\.NET(Framework|Standard)'
            $external = @($dependencies | Where-Object { $_.id -notlike 'CanopyX*' } | ForEach-Object { $_.id } | Sort-Object)
            $expectedExternal = if ($legacy) { @($LegacyDependencyIds | Sort-Object) } else { @() }
            if (($external -join ',') -ne ($expectedExternal -join ',')) {
                throw "$Assembly package external dependencies for $($group.targetFramework) are '$($external -join ',')', expected '$($expectedExternal -join ',')'."
            }
            $declared = (@($dependencies | Where-Object { $_.id -like 'CanopyX*' } | Sort-Object id | ForEach-Object { "$($_.id)@$($_.version)" }) -join ',')
            if ($declared -ne $expected) {
                throw "$Assembly package dependencies for $($group.targetFramework) are '$declared', expected '$expected'."
            }
        }
    } finally {
        $archive.Dispose()
    }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root
try {
    $solution = Join-Path $root 'CanopyX.sln'
    $packageProjects = @(
        [ordered] @{ Id = 'CanopyX'; Project = (Join-Path $root 'CanopyX/CanopyX.csproj'); DependencyIds = @() },
        [ordered] @{ Id = 'CanopyX.Html'; Project = (Join-Path $root 'CanopyX.Html/CanopyX.Html.csproj'); DependencyIds = @('CanopyX') },
        [ordered] @{ Id = 'CanopyX.Data'; Project = (Join-Path $root 'CanopyX.Data/CanopyX.Data.csproj'); DependencyIds = @('CanopyX');
            LegacyDependencyIds = @('Microsoft.Bcl.AsyncInterfaces', 'System.Text.Json') },
        [ordered] @{ Id = 'CanopyX.AspNetCore'; Project = (Join-Path $root 'CanopyX.AspNetCore/CanopyX.AspNetCore.csproj'); DependencyIds = @('CanopyX.Data');
            Frameworks = @('net8.0', 'net10.0') }
    )

    Assert-SourceLineBudget -Root $root -ProjectFolders @('CanopyX', 'CanopyX.Html', 'CanopyX.Data', 'CanopyX.AspNetCore')
    Assert-RuntimeLineBudget -Root $root
    & (Join-Path $root 'Build/Sync-Assets.ps1') -Check

    Invoke-ToolCommand -FileName 'dotnet' -Arguments @('restore', $solution) -Description 'Solution restore' -TimeoutSeconds $DotNetCommandTimeoutSeconds
    Invoke-ToolCommand -FileName 'dotnet' -Arguments @('build', $solution, '-c', $Configuration, '--no-restore') -Description 'Solution build' -TimeoutSeconds $DotNetCommandTimeoutSeconds
    Invoke-ToolCommand -FileName 'dotnet' -Arguments @('test', $solution, '-c', $Configuration, '--no-build', '--no-restore') -Description 'Test run' -TimeoutSeconds $DotNetCommandTimeoutSeconds

    if (-not $SkipExamples) {
        $examplesOutput = Join-Path $root "CanopyX.Examples/bin/$Configuration/net10.0/output"
        if (Test-Path $examplesOutput) {
            Remove-Item -LiteralPath $examplesOutput -Recurse -Force
        }

        Invoke-ToolCommand -FileName 'dotnet' -Arguments @('run', '--project', (Join-Path $root 'CanopyX.Examples/CanopyX.Examples.csproj'), '-c', $Configuration, '--no-build', '--', $examplesOutput) -Description 'Example generation' -TimeoutSeconds $DotNetCommandTimeoutSeconds

        if (-not $SkipBrowserTests) {
            # The browser tests open the generated examples; CI installs the browser before this step.
            $browserRoot = Join-Path $root 'tests/browser'
            # CI restores the packages in its own step; locally, restore whenever the lock file is newer than the install.
            $installed = Join-Path $browserRoot 'node_modules/.package-lock.json'
            if (-not $env:CI -and (-not (Test-Path $installed) -or (Get-Item (Join-Path $browserRoot 'package-lock.json')).LastWriteTimeUtc -gt (Get-Item $installed).LastWriteTimeUtc)) {
                Invoke-ToolCommand -FileName 'npm' -Arguments @('ci', '--no-audit', '--no-fund') -WorkingDirectory $browserRoot -Description 'Browser test restore' -TimeoutSeconds $DotNetCommandTimeoutSeconds
            }


            $previousExamples = $env:CANOPYX_EXAMPLES
            $env:CANOPYX_EXAMPLES = $examplesOutput
            try {
                Invoke-ToolCommand -FileName 'npm' -Arguments @('run', 'test:distribution') -WorkingDirectory $browserRoot -Description 'JavaScript package consumer smoke' -TimeoutSeconds $DotNetCommandTimeoutSeconds
                Invoke-ToolCommand -FileName 'node' -Arguments @('node_modules/@playwright/test/cli.js', 'test') -WorkingDirectory $browserRoot -Description 'Browser tests' -TimeoutSeconds $BrowserTestTimeoutSeconds
            } finally {
                $env:CANOPYX_EXAMPLES = $previousExamples
            }
        }
    }

    if (-not $SkipPack) {
        $packageRoot = Join-Path $root "artifacts/packages/$Configuration"
        if (Test-Path $packageRoot) {
            Get-ChildItem $packageRoot -Include 'CanopyX*.nupkg', 'CanopyX*.snupkg' -Recurse | Remove-Item -Force
        } else {
            New-Item -ItemType Directory -Path $packageRoot | Out-Null
        }

        foreach ($packageProject in $packageProjects) {
            Invoke-ToolCommand -FileName 'dotnet' -Arguments @('pack', $packageProject.Project, '-c', $Configuration, '--no-build', '--output', $packageRoot) -Description "$($packageProject.Id) package creation" -TimeoutSeconds $DotNetCommandTimeoutSeconds
            $version = Invoke-ToolCommand -FileName 'dotnet' -Arguments @('msbuild', $packageProject.Project, '-nologo', '-getProperty:PackageVersion', "-p:Configuration=$Configuration") -Description "$($packageProject.Id) package version" -TimeoutSeconds $DotNetCommandTimeoutSeconds -PassThruOutput
            if ([string]::IsNullOrWhiteSpace($version)) {
                throw "Package version is missing for $($packageProject.Project)."
            }

            $package = Join-Path $packageRoot "$($packageProject.Id).$version.nupkg"
            $symbols = Join-Path $packageRoot "$($packageProject.Id).$version.snupkg"
            if (-not (Test-Path $package)) {
                throw "Package was not created: $package"
            }
            if (-not (Test-Path $symbols)) {
                throw "Symbol package was not created: $symbols"
            }

            $contents = @{ PackagePath = $package; Assembly = $packageProject.Id; Version = $version; DependencyIds = $packageProject.DependencyIds }
            if ($packageProject.Frameworks) { $contents.Frameworks = $packageProject.Frameworks }
            if ($packageProject.LegacyDependencyIds) { $contents.LegacyDependencyIds = $packageProject.LegacyDependencyIds }
            Assert-PackageContents @contents
            $packageProject.Version = $version
        }

        Invoke-PackageSmoke -Root $root -PackageRoot $packageRoot -Version $packageProjects[1].Version -TimeoutSeconds $PackageConsumerTimeoutSeconds
    }
} finally {
    Pop-Location
}
