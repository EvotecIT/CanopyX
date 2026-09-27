param(
    [ValidateSet('Debug', 'Release')]
    [string] $Configuration = 'Release',

    [switch] $SkipPack,

    [ValidateRange(1, 86400)]
    [int] $DotNetCommandTimeoutSeconds = 900
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
    if ($null -ne $startInfo.ArgumentList) {
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

function Assert-PackageContents {
    param(
        [Parameter(Mandatory = $true)] [string] $PackagePath,
        [Parameter(Mandatory = $true)] [string] $Assembly,
        [Parameter(Mandatory = $true)] [string] $Version,
        [Parameter(Mandatory = $true)] [AllowEmptyCollection()] [string[]] $DependencyIds
    )

    $frameworks = @('net472', 'netstandard2.0', 'net8.0', 'net10.0')
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

        # Every framework group must list exactly the expected packages at the package's own version.
        $groups = @($nuspec.package.metadata.dependencies.group)
        if ($groups.Count -ne $frameworks.Count) {
            throw "$Assembly package has $($groups.Count) dependency groups, expected $($frameworks.Count)."
        }
        $expected = (@($DependencyIds | Sort-Object | ForEach-Object { "$_@$Version" }) -join ',')
        foreach ($group in $groups) {
            $declared = (@($group.dependency | Where-Object { $_ } | Sort-Object id | ForEach-Object { "$($_.id)@$($_.version)" }) -join ',')
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
        [ordered] @{ Id = 'CanopyX.Html'; Project = (Join-Path $root 'CanopyX.Html/CanopyX.Html.csproj'); DependencyIds = @('CanopyX') }
    )

    Assert-SourceLineBudget -Root $root -ProjectFolders @('CanopyX', 'CanopyX.Html')

    Invoke-ToolCommand -FileName 'dotnet' -Arguments @('restore', $solution) -Description 'Solution restore' -TimeoutSeconds $DotNetCommandTimeoutSeconds
    Invoke-ToolCommand -FileName 'dotnet' -Arguments @('build', $solution, '-c', $Configuration, '--no-restore') -Description 'Solution build' -TimeoutSeconds $DotNetCommandTimeoutSeconds
    Invoke-ToolCommand -FileName 'dotnet' -Arguments @('test', $solution, '-c', $Configuration, '--no-build', '--no-restore') -Description 'Test run' -TimeoutSeconds $DotNetCommandTimeoutSeconds

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

            Assert-PackageContents -PackagePath $package -Assembly $packageProject.Id -Version $version -DependencyIds $packageProject.DependencyIds
        }
    }
} finally {
    Pop-Location
}
