param([switch] $Check)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$source = Get-Content -LiteralPath (Join-Path $root 'CanopyX/Views/Locales/labels.json') -Raw | ConvertFrom-Json
# Read the shared defaults first, then optional feature partials, preserving a stable generated order.
$defaultsPath = Join-Path $root 'CanopyX/Views/CanopyLabels.Defaults.cs'
$defaultSources = @($defaultsPath) + @(Get-ChildItem -LiteralPath (Split-Path $defaultsPath) -Filter 'CanopyLabels.Defaults.*.cs' -File | Sort-Object Name | ForEach-Object { $_.FullName })
$defaultsText = ($defaultSources | ForEach-Object { [System.IO.File]::ReadAllText($_) }) -join "`n"
$defaultGroups = @{}
foreach ($path in $defaultSources) {
    $group = if ($path -eq $defaultsPath) { '' } else { [System.IO.Path]::GetFileName($path) -replace '^CanopyLabels\.Defaults\.|\.cs$', '' }
    if ($group -and $group -notmatch '^[A-Za-z][A-Za-z0-9]*$') { throw "Invalid label defaults group: $group" }
    foreach ($entry in [regex]::Matches([System.IO.File]::ReadAllText($path), '\[nameof\((\w+)\)\] = ("(?:[^"\\]|\\.)*")')) {
        $defaultGroups[$entry.Groups[1].Value] = $group
    }
}
$defaults = [regex]::Matches($defaultsText,
    '\[nameof\((\w+)\)\] = ("(?:[^"\\]|\\.)*")')
$names = @($defaults | ForEach-Object { $_.Groups[1].Value })
if ($names.Count -lt 100 -or @($names | Sort-Object -Unique).Count -ne $names.Count) { throw 'CanopyLabels.Defaults*.cs must declare every label default once.' }
$actual = @($source.PSObject.Properties.Name)
if (@(Compare-Object $names $actual).Count) { throw 'Every locale must declare exactly the CanopyLabels keys.' }
$outline = @('OverflowNote', 'UnknownTotal', 'HiddenRows', 'FullReport')

function Write-Generated([string] $Path, [string] $Content) {
    $target = Join-Path $root $Path
    $Content = $Content.Replace("`r`n", "`n")
    if ($Check) {
        $current = if (Test-Path -LiteralPath $target) { [System.IO.File]::ReadAllText($target).Replace("`r`n", "`n") } else { '' }
        if ($current -ne $Content) { throw "Generated labels are out of date: $Path. Run Build/Sync-Assets.ps1." }
    } else {
        [void][System.IO.Directory]::CreateDirectory((Split-Path -Parent $target))
        [System.IO.File]::WriteAllText($target, $Content, [System.Text.UTF8Encoding]::new($false))
    }
}

$languages = @(@{ Id = 'pl'; Name = 'Polish'; Index = 0 }, @{ Id = 'de'; Name = 'German'; Index = 1 }, @{ Id = 'es'; Name = 'Spanish'; Index = 2 },
    @{ Id = 'fr'; Name = 'French'; Index = 3 }, @{ Id = 'it'; Name = 'Italian'; Index = 4 })
foreach ($language in $languages) {
    $browser = [System.Collections.Generic.List[string]]::new()
    $static = [System.Collections.Generic.List[string]]::new()
    $properties = [System.Collections.Generic.List[string]]::new()
    $featureProperties = [ordered]@{}
    foreach ($entry in $defaults) {
        $name = $entry.Groups[1].Value
        $values = $source.$name
        if ($values.Count -ne $languages.Count -or @($values | Where-Object { $_ -isnot [string] -or -not $_.Trim() }).Count) {
            throw "The label $name needs visible text in every language."
        }
        $text = $values[$language.Index]
        $english = $entry.Groups[2].Value | ConvertFrom-Json
        $expected = @([regex]::Matches($english, '\{\w+\}') | ForEach-Object Value | Sort-Object -Unique)
        $provided = @([regex]::Matches($text, '\{\w+\}') | ForEach-Object Value | Sort-Object -Unique)
        if (@(Compare-Object $expected $provided).Count) { throw "The $($language.Id) label $name must preserve its placeholders." }
        # Plural texts ([one]...[other]...) name known categories, end with an other form, and keep the placeholders in every form.
        if ($text.StartsWith('[', [StringComparison]::Ordinal)) {
            $forms = [regex]::Matches($text, '\[(zero|one|two|few|many|other)\]([^\[]*)')
            if (-not $forms.Count -or ($forms | ForEach-Object Length | Measure-Object -Sum).Sum -ne $text.Length -or -not ($forms | Where-Object { $_.Groups[1].Value -eq 'other' })) { throw "The $($language.Id) label $name has malformed plural forms." }
            foreach ($form in $forms) { if (@(Compare-Object $expected @([regex]::Matches($form.Groups[2].Value, '\{\w+\}') | ForEach-Object Value | Sort-Object -Unique)).Count) { throw "The $($language.Id) label $name must keep its placeholders in every plural form." } }
        }
        $literal = ConvertTo-Json -InputObject $text -Compress
        $wire = $name.Substring(0, 1).ToLowerInvariant() + $name.Substring(1)
        $line = "  ${wire}: $literal,"
        if ($name -in $outline) { $static.Add($line) } else { $browser.Add($line) }
        $group = $defaultGroups[$name]
        if ($group) {
            if (-not $featureProperties.Contains($group)) { $featureProperties[$group] = [System.Collections.Generic.List[string]]::new() }
            $featureProperties[$group].Add("        labels.$name = $literal;")
        } else { $properties.Add("        $name = $literal,") }
    }
    $header = '// Generated from CanopyX/Views/Locales/labels.json by Build/Sync-Assets.ps1.'
    $labels = 'const labels = Object.freeze({' + "`n" + ($browser -join "`n") + "`n});`n"
    $staticLabels = 'const staticLabels = Object.freeze({' + "`n" + ($static -join "`n") + "`n});`n"
    Write-Generated "JavaScript/locales/$($language.Id).mjs" ($header + "`n" + $labels + $staticLabels + "export { labels, staticLabels };`nexport default labels;`n")
    Write-Generated "CanopyX.Html/Assets/canopyx-labels-$($language.Id).js" ($header + "`n(function (global) {`n" + $labels + $staticLabels +
        'const packs = global.CanopyXLocales || (global.CanopyXLocales = {});' + "`n" + "packs.$($language.Id) = Object.freeze({ labels, staticLabels });`n})(globalThis);`n")
    $initializer = "new CanopyLabels {`n" + ($properties -join "`n") + "`n    }"
    foreach ($group in $featureProperties.Keys) {
        $method = "With$($language.Name)$group"
        $initializer = "$method($initializer)"
        Write-Generated "CanopyX/Views/CanopyLabels.$($language.Name).$group.cs" ($header + "`nnamespace CanopyX;`n`n" +
            "public sealed partial class CanopyLabels {`n    private static CanopyLabels $method(CanopyLabels labels) {`n" +
            ($featureProperties[$group] -join "`n") + "`n        return labels;`n    }`n}`n")
    }
    Write-Generated "CanopyX/Views/CanopyLabels.$($language.Name).cs" ($header + "`nnamespace CanopyX;`n`n" +
        "public sealed partial class CanopyLabels {`n    /// <summary>Creates complete $($language.Name) labels. Each call returns an independent, editable pack.</summary>`n" +
        "    public static CanopyLabels $($language.Name)() => $initializer;`n}`n")
}
