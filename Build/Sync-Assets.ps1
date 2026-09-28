param(
    [switch] $Check
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$foldSource = [System.IO.File]::ReadAllText((Join-Path $root 'CanopyX/Search/CanopySearchFoldingTable.cs'))
$foldAssignment = [regex]::Match($foldSource, 'internal const string LowercasePairs\s*=\s*(?<parts>(?:"[A-Za-z0-9+/=]+"\s*\+\s*)*"[A-Za-z0-9+/=]+")\s*;')
if (-not $foldAssignment.Success) { throw 'The canonical search folding table is missing.' }
$foldPieces = [regex]::Matches($foldAssignment.Groups['parts'].Value, '"([A-Za-z0-9+/=]+)"')
$foldPairs = -join @($foldPieces | ForEach-Object { $_.Groups[1].Value })

$assets = @(
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source'
        Target = 'CanopyX.Html/Assets/canopyx.js'
    }
)

function Join-AssetSource {
    param([string] $SourcePath)

    $parts = Get-ChildItem -Path $SourcePath -Filter '*.js' -File |
        Sort-Object Name

    if ($parts.Count -eq 0) {
        throw "No JavaScript source parts found in '$SourcePath'."
    }

    $content = foreach ($part in $parts) {
        [System.IO.File]::ReadAllText($part.FullName).Replace("`r`n", "`n").Replace("`r", "`n").TrimEnd("`n")
    }

    ($content -join "`n") + "`n"
}

foreach ($asset in $assets) {
    $sourcePath = Join-Path $root $asset.Source
    $targetPath = Join-Path $root $asset.Target
    $generated = Join-AssetSource -SourcePath $sourcePath
    if (-not $generated.Contains('__CANOPYX_FOLD_PAIRS__')) { throw 'The browser search folding marker is missing.' }
    $generated = $generated.Replace('__CANOPYX_FOLD_PAIRS__', $foldPairs)

    if ($Check) {
        $current = if (Test-Path $targetPath) { [System.IO.File]::ReadAllText($targetPath).Replace("`r`n", "`n").Replace("`r", "`n") } else { '' }
        if ($current -ne $generated) {
            throw "Generated asset is out of date: $($asset.Target). Run Build/Sync-Assets.ps1."
        }

        continue
    }

    [System.IO.File]::WriteAllText($targetPath, $generated, [System.Text.UTF8Encoding]::new($false))
}
