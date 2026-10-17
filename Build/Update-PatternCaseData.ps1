<#
.SYNOPSIS
Regenerates the private Unicode casing tables used by static formatting.
.DESCRIPTION
Explicit maintenance only; the normal build never invokes this script or downloads Unicode data.
Download CaseFolding.txt, UnicodeData.txt, DerivedCoreProperties.txt and SpecialCasing.txt for the same
Unicode version from https://www.unicode.org/Public/<version>/ucd/ into a local folder first.
.PARAMETER DataDirectory
Folder containing the four official Unicode data files.
.PARAMETER Version
Unicode version of those files. The checked-in tables use 17.0.0.
.PARAMETER OutputPath
Generated C# source path. Defaults to the canonical validation owner.
.EXAMPLE
./Build/Update-PatternCaseData.ps1 -DataDirectory ./unicode-17 -Version 17.0.0
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $DataDirectory,
    [string] $Version = '17.0.0',
    [string] $OutputPath = (Join-Path $PSScriptRoot '../CanopyX/Validation/CanopyPattern.CaseData.cs')
)
$ErrorActionPreference = 'Stop'
$foldPath = Join-Path $DataDirectory 'CaseFolding.txt'
$unicodePath = Join-Path $DataDirectory 'UnicodeData.txt'
$propertiesPath = Join-Path $DataDirectory 'DerivedCoreProperties.txt'
$specialPath = Join-Path $DataDirectory 'SpecialCasing.txt'
foreach ($inputPath in @($foldPath, $propertiesPath, $specialPath)) {
    if ((Get-Content -LiteralPath $inputPath -TotalCount 1) -notmatch [regex]::Escape($Version)) {
        throw "Unicode version does not match $Version in $inputPath."
    }
}

function Get-Root([int] $value) {
    while ($parents.ContainsKey($value)) { $value = $parents[$value] }
    return $value
}
function Merge-Ranges($ranges) {
    $merged = [Collections.Generic.List[object]]::new()
    foreach ($range in ($ranges | Sort-Object Low, High)) {
        if ($merged.Count -gt 0 -and $merged[$merged.Count - 1].High + 1 -ge $range.Low) {
            $merged[$merged.Count - 1].High = [Math]::Max($merged[$merged.Count - 1].High, $range.High)
        } else { $merged.Add([pscustomobject]@{ Low = $range.Low; High = $range.High }) }
    }
    return ,$merged
}
function Pack-Pairs($pairs) {
    $bytes = [Collections.Generic.List[byte]]::new()
    foreach ($pair in $pairs) {
        foreach ($value in @([int]$pair.Low, [int]$pair.High)) {
            # Explicit little endian; regeneration is independent of the host's byte order.
            for ($shift = 0; $shift -lt 32; $shift += 8) { $bytes.Add([byte](($value -shr $shift) -band 255)) }
        }
    }
    return [Convert]::ToBase64String($bytes.ToArray())
}
$parents = @{}
foreach ($line in Get-Content -LiteralPath $foldPath) {
    if ($line -notmatch '^([0-9A-F]+);\s*[CS];\s*([0-9A-F]+);') { continue }
    $left = Get-Root ([Convert]::ToInt32($Matches[1], 16))
    $right = Get-Root ([Convert]::ToInt32($Matches[2], 16))
    if ($left -ne $right) { $parents[[Math]::Max($left, $right)] = [Math]::Min($left, $right) }
}
$fold = @($parents.Keys | Sort-Object | Where-Object { $_ -ge 128 } | ForEach-Object {
    [pscustomobject]@{ Low = $_; High = (Get-Root $_) }
})
$lower = [Collections.Generic.List[object]]::new()
$combining = [Collections.Generic.List[object]]::new()
$above = [Collections.Generic.List[object]]::new()
foreach ($line in Get-Content -LiteralPath $unicodePath) {
    $fields = $line.Split(';'); $point = [Convert]::ToInt32($fields[0], 16)
    if ($fields[13] -and $point -ge 128) { $lower.Add([pscustomobject]@{ Low = $point; High = [Convert]::ToInt32($fields[13], 16) }) }
    if ([int]$fields[3] -gt 0) { $combining.Add([pscustomobject]@{ Low = $point; High = $point }) }
    if ([int]$fields[3] -eq 230) { $above.Add([pscustomobject]@{ Low = $point; High = $point }) }
}
$cased = [Collections.Generic.List[object]]::new()
$ignorable = [Collections.Generic.List[object]]::new()
foreach ($line in Get-Content -LiteralPath $propertiesPath) {
    if ($line -notmatch '^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(Cased|Case_Ignorable)\s*#') { continue }
    $first = [Convert]::ToInt32($Matches[1], 16)
    $last = if ($Matches[2]) { [Convert]::ToInt32($Matches[2], 16) } else { $first }
    $range = [pscustomobject]@{ Low = $first; High = $last }
    if ($Matches[3] -eq 'Cased') { $cased.Add($range) } else { $ignorable.Add($range) }
}
# The unconditional full lowercase exception and conditional rules in SpecialCasing.txt are written in
# CanopyPattern.Lowercase.cs. Confirm that a future input has not added a new full lowercase exception.
foreach ($line in Get-Content -LiteralPath $specialPath) {
    if ($line -match '^([0-9A-F]+);\s*([0-9A-F ]+);[^;]*;[^;]*;\s*#' -and $Matches[2].Trim().Contains(' ') -and $Matches[1] -ne '0130') {
        throw "New unconditional full lowercase mapping requires an owner update: $line"
    }
}
$tables = [ordered]@{
    Fold = (Pack-Pairs $fold)
    Lower = (Pack-Pairs $lower)
    Cased = (Pack-Pairs (Merge-Ranges $cased))
    Ignorable = (Pack-Pairs (Merge-Ranges $ignorable))
    Combining = (Pack-Pairs (Merge-Ranges $combining))
    Above = (Pack-Pairs (Merge-Ranges $above))
}
$source = [Collections.Generic.List[string]]::new()
$source.Add('// Generated by Build/Update-PatternCaseData.ps1. Do not edit the packed bytes.')
$source.Add("// Unicode $Version, https://www.unicode.org/Public/$Version/ucd/")
$source.Add('// Unicode data copyright and permission: ../Unicode-LICENSE.txt (also included in the package).')
foreach ($inputPath in @($foldPath, $unicodePath, $propertiesPath, $specialPath)) {
    $source.Add('// SHA256 ' + [IO.Path]::GetFileName($inputPath) + ': ' + (Get-FileHash -LiteralPath $inputPath -Algorithm SHA256).Hash.ToLowerInvariant())
}
$source.Add('namespace CanopyX;')
$source.Add('')
$source.Add('internal static partial class CanopyPattern {')
foreach ($entry in $tables.GetEnumerator()) {
    $source.Add('    private const string Packed' + $entry.Key + ' =')
    for ($index = 0; $index -lt $entry.Value.Length; $index += 112) {
        $length = [Math]::Min(112, $entry.Value.Length - $index)
        $suffix = if ($index + $length -lt $entry.Value.Length) { ' +' } else { ';' }
        $source.Add('        "' + $entry.Value.Substring($index, $length) + '"' + $suffix)
    }
}
$source.Add('}')
[IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputPath), ($source -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
Write-Output "Generated Unicode ${Version}: $($fold.Count) non-ASCII fold mappings; $($lower.Count) non-ASCII lowercase mappings."
