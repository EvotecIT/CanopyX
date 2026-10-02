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

    Remove-CommentLines -Content (($content -join "`n") + "`n")
}

function Remove-CommentLines {
    param([string] $Content)

    # Comments document the source parts; the assembled runtime ships without them, which keeps it inside its gzip
    # budget. Only whole lines are removed: a line that is a // comment, and /* */ blocks that start and end their
    # lines. The block that opens the first part (what the file is and where it comes from) stays. The rule works on
    # lines, not on the language, so the layouts it could misread are refused rather than guessed at: code on a line
    # of a block comment, a block comment that opens after code, and strings that continue on the next line.
    $ordinal = [System.StringComparison]::Ordinal
    $lines = $Content.Split("`n")
    $kept = [System.Collections.Generic.List[string]]::new()
    $inBlock = $false
    $header = $Content.StartsWith('/*', $ordinal)
    for ($index = 0; $index -lt $lines.Count; $index++) {
        $line = $lines[$index]
        $text = $line.Trim()
        if ($inBlock -or $text.StartsWith('/*', $ordinal)) {
            $end = $text.IndexOf('*/', $(if ($inBlock) { 0 } else { 2 }), $ordinal)
            if ($end -ge 0 -and $end + 2 -ne $text.Length) {
                throw "Keep code off the lines of a /* */ comment in the runtime source parts: $text"
            }

            $inBlock = $end -lt 0
            if ($header) {
                $kept.Add($line)
                $header = $inBlock
            }

            continue
        }

        if ($text.StartsWith('//', $ordinal)) {
            continue
        }

        if ($text.Contains('`') -or $text.EndsWith('\', $ordinal) -or ($text.IndexOf('/*', $ordinal) -gt 0 -and $text.IndexOf('*/', $text.IndexOf('/*', $ordinal), $ordinal) -lt 0)) {
            throw "Keep template literals, continued strings, and comments that open after code out of the runtime source parts: $text"
        }

        $kept.Add($text)
    }

    $kept -join "`n"
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
