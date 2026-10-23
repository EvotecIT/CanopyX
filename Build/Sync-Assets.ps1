#Requires -Version 7.0
param(
    [switch] $Check
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'Sync-Labels.ps1') -Check:$Check
$foldSource = [System.IO.File]::ReadAllText((Join-Path $root 'CanopyX/Search/CanopySearchFoldingTable.cs'))
$foldAssignment = [regex]::Match($foldSource, 'internal const string LowercasePairs\s*=\s*(?<parts>(?:"[A-Za-z0-9+/=]+"\s*\+\s*)*"[A-Za-z0-9+/=]+")\s*;')
if (-not $foldAssignment.Success) { throw 'The canonical search folding table is missing.' }
$foldPieces = [regex]::Matches($foldAssignment.Groups['parts'].Value, '"([A-Za-z0-9+/=]+)"')
$foldPairs = -join @($foldPieces | ForEach-Object { $_.Groups[1].Value })

# Keep the frozen C# table as the canonical input. The browser copy is text: comma-separated records of base-36
# numbers, "gap.delta" for one pair or "gap.delta.count.step" for three or more pairs with the same delta at a
# fixed stride. The gap counts from the previous record's last code unit and the delta is lowercase minus
# uppercase, so the repeated high bytes of absolute code units drop out. This changes only the browser
# representation, never the protocol's lowercase mapping.
$foldBytes = [Convert]::FromBase64String($foldPairs)
$foldEntries = for ($foldOffset = 0; $foldOffset -lt $foldBytes.Length; $foldOffset += 4) {
    [pscustomobject]@{
        From = [int]$foldBytes[$foldOffset] -bor ([int]$foldBytes[$foldOffset + 1] -shl 8)
        To = [int]$foldBytes[$foldOffset + 2] -bor ([int]$foldBytes[$foldOffset + 3] -shl 8)
    }
}
function ConvertTo-Base36([int] $Value) {
    $digits = '0123456789abcdefghijklmnopqrstuvwxyz'
    $magnitude = [Math]::Abs($Value)
    $text = ''
    do { $text = [string]$digits[$magnitude % 36] + $text; $magnitude = [int][Math]::Floor($magnitude / 36) } while ($magnitude -gt 0)
    if ($Value -lt 0) { '-' + $text } else { $text }
}
for ($foldOffset = 1; $foldOffset -lt $foldEntries.Count; $foldOffset++) {
    if ($foldEntries[$foldOffset].From -le $foldEntries[$foldOffset - 1].From) { throw 'The canonical folding table must list code units in ascending order.' }
}
$foldRecords = [System.Collections.Generic.List[string]]::new()
$foldLast = 0
for ($foldOffset = 0; $foldOffset -lt $foldEntries.Count;) {
    $foldEntry = $foldEntries[$foldOffset]
    $foldDelta = $foldEntry.To - $foldEntry.From
    $foldCount = 1
    $foldStep = if ($foldOffset + 1 -lt $foldEntries.Count) { $foldEntries[$foldOffset + 1].From - $foldEntry.From } else { 0 }
    while ($foldOffset + $foldCount -lt $foldEntries.Count -and
        $foldEntries[$foldOffset + $foldCount].From -eq $foldEntry.From + $foldCount * $foldStep -and
        $foldEntries[$foldOffset + $foldCount].To - $foldEntries[$foldOffset + $foldCount].From -eq $foldDelta) { $foldCount++ }
    if ($foldCount -lt 3) { $foldCount = 1 }
    $foldFields = @((ConvertTo-Base36 ($foldEntry.From - $foldLast)), (ConvertTo-Base36 $foldDelta))
    if ($foldCount -ge 3) { $foldFields += @((ConvertTo-Base36 $foldCount), (ConvertTo-Base36 $foldStep)) }
    $foldRecords.Add($foldFields -join '.')
    $foldLast = $foldEntry.From + ($foldCount - 1) * $(if ($foldCount -ge 3) { $foldStep } else { 0 })
    $foldOffset += $foldCount
}
$foldPairs = $foldRecords -join ','

$tokenFallbacks = Get-Content -LiteralPath (Join-Path $root 'CanopyX.Html/Assets/Shared/canopyx-fallbacks.json') -Raw | ConvertFrom-Json -AsHashtable
function Add-TokenFallbacks([string] $Content) {
    [regex]::Replace($Content, 'var\((--hfx-[a-z0-9-]+)\)', [System.Text.RegularExpressions.MatchEvaluator] {
        param($match)
        $name = $match.Groups[1].Value
        if (-not $tokenFallbacks.ContainsKey($name)) { throw "Missing shared fallback: $name" }
        'var(' + $name + ',' + $tokenFallbacks[$name] + ')'
    })
}
# Paper uses the canonical light branch directly, without assigning palette roles to the host.
$printDefaults = @{}
foreach ($entry in @(@('TEXT', '--hfx-color-text'), @('SURFACE', '--hfx-color-surface'), @('BORDER', '--hfx-color-border-control'))) {
    $value = $tokenFallbacks[$entry[1]]
    if ($value -match '^light-dark\(([^,()]+),[^()]+\)$') { $value = $Matches[1].Trim() }
    elseif ($value -match 'light-dark|var\(') { throw "The paper token must have a resolved light value: $($entry[1])" }
    $printDefaults['__CX_PRINT_' + $entry[0] + '__'] = $value
}
$statusFallbacks = [ordered]@{}
foreach ($name in @($tokenFallbacks.Keys | Sort-Object)) { if ($name -match '^--hfx-color-status-.*-(fg|bg)$') { $statusFallbacks[$name] = $tokenFallbacks[$name] } }
$statusFallbackJson = ConvertTo-Json -InputObject $statusFallbacks -Compress

$flowShell = 'CanopyX.Html/Assets/canopyx.flow-entry.source/50-flow-shell.js'
$flowHostStyle = 'CanopyX.Html/Assets/canopyx.flow-entry.source/flow-host.css'
$assets = @(
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source'
        Target = 'CanopyX.Html/Assets/canopyx.js'
        Folding = $true
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source/base.css'
        Extension = 'CanopyX.Html/Assets/canopyx.source/canopyx.css'
        Target = 'CanopyX.Html/Assets/canopyx.css'
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source'
        Extension = 'CanopyX.Html/Assets/canopyx.interactive.source'
        Target = 'CanopyX.Html/Assets/canopyx-interactive.js'
        Folding = $true
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source/base.css'
        Extension = @('CanopyX.Html/Assets/canopyx.source/canopyx.css', 'CanopyX.Html/Assets/canopyx.interactive.source/canopyx.css')
        Target = 'CanopyX.Html/Assets/canopyx-interactive.css'
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source'
        Extension = 'CanopyX.Html/Assets/canopyx.interactive.source'
        Target = 'CanopyX.Html/Assets/canopyx-module.mjs'
        Folding = $true
        Module = $true
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source'
        Extension = @('CanopyX.Html/Assets/canopyx.grid.source', 'CanopyX.Html/Assets/canopyx.interactive.source', $flowShell)
        Target = 'CanopyX.Html/Assets/canopyx-grid.js'
        Folding = $true
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source/base.css'
        Extension = @('CanopyX.Html/Assets/canopyx.source/canopyx.css', 'CanopyX.Html/Assets/canopyx.interactive.source/canopyx.css', 'CanopyX.Html/Assets/canopyx.grid.source/chrome.css', 'CanopyX.Html/Assets/canopyx.grid.source/canopyx.css', $flowHostStyle)
        Target = 'CanopyX.Html/Assets/canopyx-grid.css'
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source'
        Extension = @('CanopyX.Html/Assets/canopyx.grid.source', 'CanopyX.Html/Assets/canopyx.interactive.source', $flowShell)
        Target = 'CanopyX.Html/Assets/canopyx-grid-module.mjs'
        Folding = $true
        Module = $true
        Grid = $true
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source'
        Extension = @('CanopyX.Html/Assets/canopyx.grid.source', 'CanopyX.Html/Assets/canopyx.interactive.source', 'CanopyX.Html/Assets/canopyx.reporting.source', $flowShell)
        Target = 'CanopyX.Html/Assets/canopyx-reporting.js'
        Folding = $true
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source/base.css'
        Extension = @('CanopyX.Html/Assets/canopyx.source/canopyx.css', 'CanopyX.Html/Assets/canopyx.interactive.source/canopyx.css', 'CanopyX.Html/Assets/canopyx.grid.source/chrome.css', 'CanopyX.Html/Assets/canopyx.grid.source/canopyx.css', 'CanopyX.Html/Assets/canopyx.reporting.source/canopyx.css', $flowHostStyle)
        Target = 'CanopyX.Html/Assets/canopyx-reporting.css'
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source'
        Extension = @('CanopyX.Html/Assets/canopyx.grid.source', 'CanopyX.Html/Assets/canopyx.interactive.source', 'CanopyX.Html/Assets/canopyx.reporting.source', $flowShell)
        Target = 'CanopyX.Html/Assets/canopyx-reporting-module.mjs'
        Folding = $true
        Module = $true
        Grid = $true
    }
    # The flow entry point: forms and flows without grid or tree code. It takes the core's small shared parts by name and the
    # flow shell the grid entry points also carry; the forms and flow parts load beside it (Build/parts.json, runtime "flow").
    @{
        Source = 'CanopyX.Html/Assets/canopyx.flow-entry.source/00-flow-entry.js'
        Extension = @('CanopyX.Html/Assets/canopyx.source/01-fill.js', 'CanopyX.Html/Assets/canopyx.source/01-number-format.js', 'CanopyX.Html/Assets/canopyx.source/01-trust.js', 'CanopyX.Html/Assets/canopyx.source/02-design-tokens.js',
            'CanopyX.Html/Assets/canopyx.source/05-patterns.js', 'CanopyX.Html/Assets/canopyx.source/05-search-folding.js', 'CanopyX.Html/Assets/canopyx.grid.source/00-grid-pure.js',
            'CanopyX.Html/Assets/canopyx.source/82-parts.js', $flowShell,
            'CanopyX.Html/Assets/canopyx.flow-entry.source/90-flow-boot.js')
        Target = 'CanopyX.Html/Assets/canopyx-flow-entry.js'
        Folding = $true
        Kind = 'flow'
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source/base.css'
        Extension = $flowHostStyle
        Target = 'CanopyX.Html/Assets/canopyx-flow-entry.css'
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.flow-entry.source/00-flow-entry.js'
        Extension = @('CanopyX.Html/Assets/canopyx.source/01-fill.js', 'CanopyX.Html/Assets/canopyx.source/01-number-format.js', 'CanopyX.Html/Assets/canopyx.source/01-trust.js', 'CanopyX.Html/Assets/canopyx.source/02-design-tokens.js',
            'CanopyX.Html/Assets/canopyx.source/05-patterns.js', 'CanopyX.Html/Assets/canopyx.source/05-search-folding.js', 'CanopyX.Html/Assets/canopyx.grid.source/00-grid-pure.js',
            'CanopyX.Html/Assets/canopyx.source/82-parts.js', $flowShell,
            'CanopyX.Html/Assets/canopyx.flow-entry.source/90-flow-boot.js')
        Target = 'CanopyX.Html/Assets/canopyx-flow-module.mjs'
        Folding = $true
        Module = $true
        Kind = 'flow'
    }
)

# Lazy parts (Build/parts.json): each part's scripts and styles, the context its code receives and the entry points that know it.
# Entry points leave out every script a part lists, unless that part also lists it as shared.
$partList = @((Get-Content -LiteralPath (Join-Path $PSScriptRoot 'parts.json') -Raw | ConvertFrom-Json).parts)
# Dependencies cover every entry point. Empty views means explicit/dependency-only selection;
# otherwise a dependency covers its consumer's views. The runtime loader also requires an acyclic graph.
$partNames = @($partList | ForEach-Object name)
foreach ($part in $partList) {
    # View gating has one field: features lists the view features that make a view load the part (CanopyHtmlPart maps them).
    foreach ($retired in 'feature', 'pager', 'editable') {
        if ($part.PSObject.Properties.Name -contains $retired) { throw "Part '$($part.name)' uses '$retired'; list the view feature under features instead." }
    }
    if ($part.features -and @($part.features | Where-Object { $_ -isnot [string] -or $_ -notmatch '^[a-z][A-Za-z]{0,31}$' }).Count) {
        throw "Part '$($part.name)' has an invalid feature name."
    }
    foreach ($name in @($part.requires | Where-Object { $_ })) {
        $required = $partList | Where-Object name -EQ $name
        if (-not $required) { throw "Part '$($part.name)' requires the unknown part '$name'." }
        if (@($part.runtimes | Where-Object { $_ -notin $required.runtimes }).Count -or
            ($required.views.Count -gt 0 -and @($part.views | Where-Object { $_ -notin $required.views }).Count)) {
            throw "Part '$($part.name)' requires '$name', which some of its entry points or views do not have."
        }
    }
}
function Test-PartCycle([string] $Name, [string[]] $Chain) {
    if ($Chain -contains $Name) { throw "Parts require each other: $(($Chain + $Name) -join ' -> ')." }
    foreach ($next in @(($partList | Where-Object name -EQ $Name).requires | Where-Object { $_ })) { Test-PartCycle $next ($Chain + $Name) }
}
$partNames | ForEach-Object { Test-PartCycle $_ @() }
$partOwnedPaths = @(foreach ($part in $partList) {
    $shared = @($part.shared | Where-Object { $_ } | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $root $_)) })
    foreach ($script in $part.scripts) {
        $path = [IO.Path]::GetFullPath((Join-Path $root $script))
        if ((Test-Path -LiteralPath $path -PathType Leaf) -and $path -notin $shared) { $path }
    }
})
# Tree-only core parts define what the grid parts define again for flat grids (the tree menus' labels); grid runtimes leave them out.
$treeOnlyParts = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tree-only-parts.json') -Raw | ConvertFrom-Json)
$treeOnlyPaths = @($treeOnlyParts | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $root $_)) })
function Join-AssetSource {
    param([string] $SourcePath, [string[]] $ExtensionPath, [switch] $PartSource, [switch] $GridRuntime)

    $parts = if (Test-Path -LiteralPath $SourcePath -PathType Leaf) { @(Get-Item -LiteralPath $SourcePath) }
        else { @(Get-ChildItem -LiteralPath $SourcePath -Filter '*.js' -File | Sort-Object Name) }

    if ($ExtensionPath) {
        $extra = foreach ($extension in $ExtensionPath) {
            if (Test-Path -LiteralPath $extension -PathType Leaf) { Get-Item -LiteralPath $extension }
            else { Get-ChildItem -LiteralPath $extension -Filter '*.js' -File | Sort-Object Name }
        }
        if (Test-Path -LiteralPath $SourcePath -PathType Leaf) { $parts = @($parts) + @($extra) }
        else { $parts = @($parts | Where-Object Name -LT '90-') + @($extra) + @($parts | Where-Object Name -GE '90-') }
    }

    if (-not $PartSource) { $parts = @($parts | Where-Object FullName -NotIn $partOwnedPaths) }
    if ($GridRuntime) { $parts = @($parts | Where-Object FullName -NotIn $treeOnlyPaths) }
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

        if ($text.Length -eq 0 -or $text.StartsWith('//', $ordinal)) {
            continue
        }

        if ($text.Contains('`') -or $text.EndsWith('\', $ordinal) -or ($text.IndexOf('/*', $ordinal) -gt 0 -and $text.IndexOf('*/', $text.IndexOf('/*', $ordinal), $ordinal) -lt 0)) {
            throw "Keep template literals, continued strings, and comments that open after code out of the runtime source parts: $text"
        }

        $kept.Add($text)
    }

    ($kept -join "`n") + "`n"
}

function ConvertTo-Module {
    param([string] $Content, [switch] $Grid, [switch] $Flow)

    # The module uses the same implementation as the interactive classic script. Only its host, automatic
    # browser mount, and exports differ; importing it on a server neither needs a DOM nor changes global state.
    $footer = '})(typeof window !== "undefined" ? window : this);'
    $automatic = 'const navigation = global.performance && performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;'
    if (-not $Content.EndsWith($footer + "`n", [System.StringComparison]::Ordinal) -or
        ([regex]::Matches($Content, [regex]::Escape($automatic))).Count -ne 1) {
        throw 'The canonical runtime mount boundary changed; update the module assembly explicitly.'
    }
    $Content = $Content.Replace($automatic, "if (typeof document !== `"undefined`") {`n" + $automatic)
    $Content = $Content.Substring(0, $Content.Length - $footer.Length - 1) + "}`n})(runtimeHost);`n"
    $header = @'
const runtimeHost = typeof window === "undefined" ? {} : window;
if (runtimeHost.CanopyX && (runtimeHost.CanopyX.protocol !== "canopyx/2" || !runtimeHost.CanopyX.labels.actions)) {
throw new Error("CanopyX: load the interactive runtime or module before the core script.");
}
'@
    $exports = @'
const CanopyX = runtimeHost.CanopyX;
const { protocol, createTreeGrid, configure, unconfigure, mount, sources, badge, labels, registerExportFormat, use, registerPart, setNonce,
  mountUi, contextMenu, tabs, stepper, dialog, drawer, popover, tooltip, menu } = CanopyX;
export { protocol, createTreeGrid, configure, unconfigure, mount, sources, badge, labels, registerExportFormat, use, registerPart, setNonce,
  mountUi, contextMenu, tabs, stepper, dialog, drawer, popover, tooltip, menu };
export default CanopyX;
'@
    # Parts load from files beside the module (Build/parts.json), as they do beside a classic runtime script.
    $header += "`nif (typeof document !== `"undefined`") runtimeHost.CanopyXFilterEditorBase = new URL(`"./`", import.meta.url).href;`n"
    if ($Grid) {
        $header = $header.Replace('!runtimeHost.CanopyX.labels.actions', '!runtimeHost.CanopyX.createDataGrid')
        $header = $header.Replace('interactive runtime or module', 'grid runtime or module')
        $exports = $exports.Replace('createTreeGrid, configure', 'createTreeGrid, createDataGrid, createCalendar, createFlow, createMatrix, createDiff, createChangeList, createPropagation, enhance, grid, configure')
    }
    if ($Flow) {
        # The flow module needs only an entry point that creates flows: the flow entry or a grid entry point.
        $header = $header.Replace('(runtimeHost.CanopyX.protocol !== "canopyx/2" || !runtimeHost.CanopyX.labels.actions)', '!runtimeHost.CanopyX.createFlow')
        $header = $header.Replace('interactive runtime or module before the core script', 'flow or grid runtime, or this module, before the core script')
        $exports = $exports.Replace('protocol, createTreeGrid, configure, unconfigure, mount, sources, badge, labels, registerExportFormat, use, registerPart, setNonce', 'createFlow, configure, unconfigure, mount, use, registerPart, setNonce')
        $exports = [regex]::Replace($exports, ',\r?\n\s+mountUi, contextMenu, tabs, stepper, dialog, drawer, popover, tooltip, menu', '')
    }
    $header.Replace("`r`n", "`n") + "`n" + $Content + $exports.Replace("`r`n", "`n") + "`n"
}

function Compress-ScriptSpacing {
    param([string] $Content)

    # Preserve ASI boundaries and quoted literals. A slash may start a regex, comment or division: keep its suffix
    # and the following newline. Join only after delimiters that cannot end an ASI statement, or before a closer.
    $literal = '("(?:\\.|[^"\\])*"|''(?:\\.|[^''\\])*''|/.*)'
    $output = [System.Text.StringBuilder]::new()
    $previous = ''
    $slash = $false
    foreach ($line in $Content.Split("`n")) {
        $pieces = [regex]::Split($line, $literal)
        for ($i = 0; $i -lt $pieces.Length; $i += 2) {
            $pieces[$i] = [regex]::Replace($pieces[$i], '\s*([=(){},;\[\]<>!&|?:%*^])\s*', '$1')
            # A spaced + or - joins its operands unless a neighbour is another + or -, which would form ++ or --.
            $pieces[$i] = [regex]::Replace($pieces[$i], '(?<![+\-\s])\s+([+\-])\s+(?![+\-\s])', '$1')
            # A closing brace ends the statement before it; dropping a needed empty statement would not parse.
            $pieces[$i] = $pieces[$i].Replace(';}', '}')
        }
        $compact = $pieces -join ''
        if ($output.Length -and ($slash -or ($previous -notmatch '[;,{(\[]$' -and $compact -notmatch '^[)}\]]'))) {
            [void]$output.Append("`n")
        } elseif ($output.Length -and $compact.StartsWith('}', [StringComparison]::Ordinal) -and $previous.EndsWith(';', [StringComparison]::Ordinal)) {
            [void]$output.Remove($output.Length - 1, 1)
        }
        [void]$output.Append($compact)
        $previous = $compact
        $slash = @($pieces | Where-Object { $_.StartsWith('/') }).Count -gt 0
    }
    $output.ToString()
}

function Compress-StyleSpacing {
    param([string] $Content)

    # Whitespace around braces and after semicolons, commas and declaration colons carries no meaning in CSS.
    # Quoted text stays as written; spaces inside values and between selector parts are kept.
    $lines = foreach ($line in $Content.Split("`n")) {
        $pieces = [regex]::Split($line, '("(?:\\.|[^"\\])*"|''(?:\\.|[^''\\])*'')')
        for ($i = 0; $i -lt $pieces.Length; $i += 2) {
            $piece = [regex]::Replace($pieces[$i], '\s*([{}])\s*', '$1')
            $piece = [regex]::Replace($piece, '([;,])\s+', '$1')
            $pieces[$i] = [regex]::Replace($piece, '((?:^|[{;])-*[A-Za-z][\w-]*):\s+', '$1:')
        }
        $pieces -join ''
    }
    $lines -join "`n"
}

function Get-AssetHash([string] $Content) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Content)))).Replace('-', '').ToLowerInvariant().Substring(0, 16) }
    finally { $sha.Dispose() }
}

# Each part becomes canopyx-<name>.js (and .css): its scripts in the listed order inside a registration that destructures the
# context the runtime hands its install function. The version hashes the complete generated install definition and style, so a runtime only
# installs the part of its own build. Entry points read the manifest of the parts they know (__CX_PARTS__).
$partBuilds = foreach ($part in $partList) {
    $scriptPaths = @($part.scripts | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $root $_)) })
    $body = Add-TokenFallbacks (Join-AssetSource -SourcePath $scriptPaths[0] -ExtensionPath @($scriptPaths | Select-Object -Skip 1) -PartSource)
    $style = ''
    if ($part.styles) {
        $stylePaths = @($part.styles | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $root $_)) })
        $style = Join-AssetSource -SourcePath $stylePaths[0] -ExtensionPath @($stylePaths | Select-Object -Skip 1) -PartSource
        if ($part.styleScope) { $style = $style.Replace($part.styleScope[0], $part.styleScope[1]) }
        $style = Compress-StyleSpacing (Add-TokenFallbacks $style)
    }
    $version = '__CX_PART_VERSION__'
    $requires = if ($part.requires) { ', requires:' + (ConvertTo-Json -InputObject @($part.requires) -Compress) } else { '' }
    $key = 'context.' + $part.key
    $header = "(function(global) {`n`"use strict`";`nconst installed = new WeakSet();`nconst part = {version:`"$version`"$requires, install(context) {`n" +
        "if (installed.has($key)) return;`nconst {$($part.context -join ',')} = context;`n" + $(if ($part.start) { $part.start + "`n" } else { '' })
    $footer = $(if ($part.end) { $part.end + "`n" } else { '' }) + "installed.add($key);`n}};`n" +
        "(global.CanopyXParts ||= []).push([`"$($part.name)`", part]);`n})(typeof window !== `"undefined`" ? window : globalThis);`n"
    $script = Compress-ScriptSpacing ($header.Replace("`r`n", "`n") + $body + $footer.Replace("`r`n", "`n"))
    $version = Get-AssetHash ($script + $style)
    $script = $script.Replace('__CX_PART_VERSION__', $version)
    [pscustomobject]@{
        Part = $part; Version = $version; Script = $script; Style = $style
        ScriptName = 'canopyx-' + $part.name + '.' + (Get-AssetHash $script) + '.js'
        StyleName = if ($style) { 'canopyx-' + $part.name + '.' + (Get-AssetHash $style) + '.css' } else { $null }
    }
}
foreach ($build in $partBuilds) {
    $assets += @{ Generated = $build.Script; Target = 'CanopyX.Html/Assets/canopyx-' + $build.Part.name + '.js' }
    if ($build.Style) { $assets += @{ Generated = $build.Style; Target = 'CanopyX.Html/Assets/canopyx-' + $build.Part.name + '.css' } }
}
function Get-PartManifest([string] $Kind) {
    $entries = foreach ($build in $partBuilds | Where-Object { $_.Part.runtimes -contains $Kind }) {
        $files = @($build.Version, $build.ScriptName) + @($build.StyleName | Where-Object { $_ })
        '"' + $build.Part.name + '":[' + (($files | ForEach-Object { '"' + $_ + '"' }) -join ',') + ']'
    }
    '{' + ($entries -join ',') + '}'
}
# CanopyX.Html reads this manifest to write each part beside the entry points that know it and to embed it in the fragments that need it.
$partIndex = [ordered]@{ parts = @(foreach ($build in $partBuilds) {
    $entry = [ordered]@{ name = $build.Part.name; label = $build.Part.label; version = $build.Version; script = 'canopyx-' + $build.Part.name + '.js' }
    if ($build.Style) { $entry.style = 'canopyx-' + $build.Part.name + '.css' }
    $entry.runtimes = @($build.Part.runtimes); $entry.views = @($build.Part.views)
    if ($build.Part.sources) { $entry.sources = @($build.Part.sources) }
    if ($build.Part.presenters) { $entry.presenters = @($build.Part.presenters) }
    if ($build.Part.features) { $entry.features = @($build.Part.features) }
    if ($build.Part.deepLink) { $entry.deepLink = $true }
    if ($build.Part.requires) { $entry.requires = @($build.Part.requires) }
    $entry
}) }
$assets += @{ Generated = (ConvertTo-Json -InputObject $partIndex -Depth 5).Replace("`r`n", "`n") + "`n"; Target = 'CanopyX.Html/Assets/canopyx-parts.json' }
foreach ($asset in $assets) {
    $sourcePath = if ($asset.Source) { Join-Path $root $asset.Source } else { $null }
    $targetPath = Join-Path $root $asset.Target
    $extensionPath = if ($asset.Extension) { @($asset.Extension | ForEach-Object { Join-Path $root $_ }) } else { $null }
    $grid = [bool]($asset.Extension | Where-Object { $_ -like '*canopyx.grid.source' })
    $generated = if ($asset.Generated) { $asset.Generated } else { Join-AssetSource -SourcePath $sourcePath -ExtensionPath $extensionPath -GridRuntime:$grid }
    if ($asset.Folding) {
        if (-not $generated.Contains('__CX_PARTS__')) { throw 'The part manifest marker is missing.' }
        $generated = $generated.Replace('__CX_PARTS__', (Get-PartManifest $(if ($asset.Kind) { $asset.Kind } elseif ($grid) { 'grid' } else { 'tree' })))
    }
    if ($asset.Folding) {
        if (-not $generated.Contains('__CANOPYX_FOLD_PAIRS__')) { throw 'The browser search folding marker is missing.' }
        $generated = $generated.Replace('__CANOPYX_FOLD_PAIRS__', $foldPairs)
    }
    $generated = (Add-TokenFallbacks $generated).Replace('__CX_STATUS_FALLBACKS__', $statusFallbackJson)
    foreach ($marker in $printDefaults.Keys) { $generated = $generated.Replace($marker, $printDefaults[$marker]) }
    if ($asset.Module) { $generated = ConvertTo-Module -Content $generated -Grid:([bool]$asset.Grid) -Flow:($asset.Kind -eq 'flow') }
    if ($asset.Folding) { $generated = Compress-ScriptSpacing -Content $generated }
    if (-not $asset.Generated -and $asset.Target.EndsWith('.css')) {
        $generated = Compress-StyleSpacing -Content $generated
    }

    if ($Check) {
        $current = if (Test-Path $targetPath) { [System.IO.File]::ReadAllText($targetPath).Replace("`r`n", "`n").Replace("`r", "`n") } else { '' }
        if ($current -ne $generated) {
            throw "Generated asset is out of date: $($asset.Target). Run Build/Sync-Assets.ps1."
        }

        continue
    }

    [System.IO.File]::WriteAllText($targetPath, $generated, [System.Text.UTF8Encoding]::new($false))
}
