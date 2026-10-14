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

$assets = @(
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source'
        Target = 'CanopyX.Html/Assets/canopyx.js'
        Folding = $true
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source/canopyx.css'
        Target = 'CanopyX.Html/Assets/canopyx.css'
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source'
        Extension = 'CanopyX.Html/Assets/canopyx.interactive.source'
        Target = 'CanopyX.Html/Assets/canopyx-interactive.js'
        Folding = $true
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source/canopyx.css'
        Extension = 'CanopyX.Html/Assets/canopyx.interactive.source/canopyx.css'
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
        Extension = @('CanopyX.Html/Assets/canopyx.grid.source', 'CanopyX.Html/Assets/canopyx.interactive.source')
        Target = 'CanopyX.Html/Assets/canopyx-grid.js'
        Folding = $true
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source/canopyx.css'
        Extension = @('CanopyX.Html/Assets/canopyx.interactive.source/canopyx.css', 'CanopyX.Html/Assets/canopyx.grid.source/chrome.css', 'CanopyX.Html/Assets/canopyx.grid.source/canopyx.css')
        Target = 'CanopyX.Html/Assets/canopyx-grid.css'
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source'
        Extension = @('CanopyX.Html/Assets/canopyx.grid.source', 'CanopyX.Html/Assets/canopyx.interactive.source')
        Target = 'CanopyX.Html/Assets/canopyx-grid-module.mjs'
        Folding = $true
        Module = $true
        Grid = $true
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source'
        Extension = @('CanopyX.Html/Assets/canopyx.grid.source', 'CanopyX.Html/Assets/canopyx.interactive.source', 'CanopyX.Html/Assets/canopyx.reporting.source')
        Target = 'CanopyX.Html/Assets/canopyx-reporting.js'
        Folding = $true
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source/canopyx.css'
        Extension = @('CanopyX.Html/Assets/canopyx.interactive.source/canopyx.css', 'CanopyX.Html/Assets/canopyx.grid.source/chrome.css', 'CanopyX.Html/Assets/canopyx.grid.source/canopyx.css', 'CanopyX.Html/Assets/canopyx.reporting.source/canopyx.css')
        Target = 'CanopyX.Html/Assets/canopyx-reporting.css'
    }
    @{
        Source = 'CanopyX.Html/Assets/canopyx.source'
        Extension = @('CanopyX.Html/Assets/canopyx.grid.source', 'CanopyX.Html/Assets/canopyx.interactive.source', 'CanopyX.Html/Assets/canopyx.reporting.source')
        Target = 'CanopyX.Html/Assets/canopyx-reporting-module.mjs'
        Folding = $true
        Module = $true
        Grid = $true
    }
)

$filterEditorParts = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'filter-editor-parts.json') -Raw | ConvertFrom-Json)
$filterEditorPaths = @($filterEditorParts | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $root $_)) })
# Export parts ship in the lazy export file of the grid runtimes. The interactive tree runtime includes its export part
# directly; the grid-only export parts never reach a tree-only runtime.
$exportParts = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'export-parts.json') -Raw | ConvertFrom-Json)
$exportPaths = @($exportParts | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $root $_)) })
# The history presenters (status strips, sparklines) ship in their own part, loaded by grids with such a column.
$historyParts = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'history-parts.json') -Raw | ConvertFrom-Json)
$historyPaths = @($historyParts | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $root $_)) })
# Tree-only core parts define what the grid parts define again for flat grids (the tree menus' labels); grid runtimes leave them out.
$treeOnlyParts = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tree-only-parts.json') -Raw | ConvertFrom-Json)
$treeOnlyPaths = @($treeOnlyParts | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $root $_)) })

function Join-AssetSource {
    param([string] $SourcePath, [string[]] $ExtensionPath, [switch] $IncludeFilterEditor, [switch] $GridRuntime)

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

    if (-not $IncludeFilterEditor) { $parts = @($parts | Where-Object FullName -NotIn $filterEditorPaths) }
    if ($GridRuntime) { $parts = @($parts | Where-Object { $_.FullName -notin $exportPaths -and $_.FullName -notin $treeOnlyPaths -and $_.FullName -notin $historyPaths }) }
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
    param([string] $Content, [switch] $Grid)

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
const { protocol, createTreeGrid, configure, unconfigure, mount, sources, badge, labels, registerExportFormat } = CanopyX;
export { protocol, createTreeGrid, configure, unconfigure, mount, sources, badge, labels, registerExportFormat };
export default CanopyX;
'@
    # Optional parts load from files beside the module: the tree tools part for every module, the editor and export parts for grids.
    $header += "`nif (typeof document !== `"undefined`") runtimeHost.CanopyXFilterEditorBase = new URL(`"./`", import.meta.url).href;`n"
    if ($Grid) {
        $header = $header.Replace('!runtimeHost.CanopyX.labels.actions', '!runtimeHost.CanopyX.createDataGrid')
        $header = $header.Replace('interactive runtime or module', 'grid runtime or module')
        $exports = $exports.Replace('createTreeGrid, configure', 'createTreeGrid, createDataGrid, configure')
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

$editorBody = Join-AssetSource -SourcePath $filterEditorPaths[0] -ExtensionPath $filterEditorPaths[1..($filterEditorPaths.Count - 1)] -IncludeFilterEditor
$editorStyle = Compress-StyleSpacing (Join-AssetSource -SourcePath (Join-Path $root 'CanopyX.Html/Assets/canopyx.filter-editor.source/canopyx.css') -ExtensionPath (Join-Path $root 'CanopyX.Html/Assets/canopyx.filter-editor.source/columns.css'))
$editorVersion = Get-AssetHash ($editorBody + $editorStyle)
$editorHeader = @'
(function(global) {
"use strict";
const installed = new WeakSet();
global.CanopyXFilterEditor = {version:"__VERSION__", install(context) {
if (installed.has(context.DataGrid.prototype)) return;
const {DataGrid,h,setText,gridButton,gridInputLabel,gridOption,gridScalar,gridQuery,gridQueryStart,
GRID_FILTER_LABELS,gridResultShape,gridQueryRows,gridOrder,gridColumnProjection,gridCellRenderer,cellValue,cellText,foldText,
reachable,gridMatchesGroup,gridDecorateButton,gridIcon,numberFormat,fill,announceMenu,reportingRangeRows} = context;
const buildFilters = DataGrid.prototype.buildGridFilters;
'@
$editorFooter = @'
Object.assign(DataGrid.prototype, COLUMNS_MENU, {buildGridFilters:buildFilters});
context.GRID_REPORTING?.installFilters?.({gridDateInput});
installed.add(DataGrid.prototype);
}};
})(typeof window !== "undefined" ? window : globalThis);
'@
$editorScript = Compress-ScriptSpacing (($editorHeader.Replace('__VERSION__', $editorVersion).Replace("`r`n", "`n")) + "`n" + $editorBody + $editorFooter.Replace("`r`n", "`n") + "`n")
$editorScriptName = 'canopyx-filter-editor.' + (Get-AssetHash $editorScript) + '.js'
$editorStyleName = 'canopyx-filter-editor.' + (Get-AssetHash $editorStyle) + '.css'
$assets += @(@{ Generated = $editorScript; Target = 'CanopyX.Html/Assets/canopyx-filter-editor.js' },
    @{ Generated = $editorStyle; Target = 'CanopyX.Html/Assets/canopyx-filter-editor.css' })
$exportBody = Join-AssetSource -SourcePath $exportPaths[0] -ExtensionPath $exportPaths[1..($exportPaths.Count - 1)]
$exportVersion = Get-AssetHash $exportBody
$exportHeader = @'
(function(global) {
"use strict";
const installed = new WeakSet();
global.CanopyXExport = {version:"__VERSION__", install(context) {
if (installed.has(context.EXPORT_IMPL)) return;
const {DataGrid,EXPORT_IMPL,h,setText,gridButton,gridOption,fill,numberFormat,gridOperationActive,formatting,gridQuery,
validateGridCursorPage,validateGridPage,GRID_REPORTING,gridFreeze,cellValue,cellText,isCellObject,exportTimeout,exportFormat,EXPORT_FORMATS} = context;
'@
$exportFooter = @'
DataGrid.prototype.renderGridExport = exportMenu;
installed.add(EXPORT_IMPL);
}};
})(typeof window !== "undefined" ? window : globalThis);
'@
$exportScript = Compress-ScriptSpacing (($exportHeader.Replace('__VERSION__', $exportVersion).Replace("`r`n", "`n")) + "`n" + $exportBody + $exportFooter.Replace("`r`n", "`n") + "`n")
$exportScriptName = 'canopyx-export.' + (Get-AssetHash $exportScript) + '.js'
$assets += @(@{ Generated = $exportScript; Target = 'CanopyX.Html/Assets/canopyx-export.js' })

$historyBody = Join-AssetSource -SourcePath $historyPaths[0]
$historyVersion = Get-AssetHash $historyBody
$historyHeader = @'
(function(global) {
"use strict";
const installed = new WeakSet();
global.CanopyXHistory = {version:"__VERSION__", install(context) {
if (installed.has(context.GRID_HISTORY_IMPL)) return;
const {GRID_HISTORY_IMPL,h,setText,fill,gridSeries,gridPresenterTone,toneColors,toneOf,GRID_TONE_RANK} = context;
'@
$historyFooter = @'
GRID_HISTORY_IMPL.render = gridRenderHistory;
installed.add(GRID_HISTORY_IMPL);
}};
})(typeof window !== "undefined" ? window : globalThis);
'@
$historyScript = Compress-ScriptSpacing (($historyHeader.Replace('__VERSION__', $historyVersion).Replace("`r`n", "`n")) + "`n" + $historyBody + $historyFooter.Replace("`r`n", "`n") + "`n")
$historyScriptName = 'canopyx-history.' + (Get-AssetHash $historyScript) + '.js'
$assets += @(@{ Generated = $historyScript; Target = 'CanopyX.Html/Assets/canopyx-history.js' })

# The tree tools part: the shared toolbar menus, column fitting and export menu sources plus the tree's own parts in
# canopyx.tree-tools.source, with the shared chrome and Columns menu styles. Every tree runtime loads it on mount. Its export
# writers live in an EXPORT_IMPL of its own, so a grid runtime's export part keeps the runtime's writers.
$toolsParts = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tree-tools-parts.json') -Raw | ConvertFrom-Json
$toolsPaths = @($toolsParts.scripts | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $root $_)) })
$toolsBody = Join-AssetSource -SourcePath $toolsPaths[0] -ExtensionPath $toolsPaths[1..($toolsPaths.Count - 1)] -IncludeFilterEditor
$toolsStylePaths = @($toolsParts.styles | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $root $_)) })
# The shared chrome targets .cx-chrome in the grid stylesheets; this copy targets tree hosts only (.cx-tree-tools), so on a grid
# runtime page it never overrides a flat grid's own rules that follow the chrome.
$toolsStyle = Compress-StyleSpacing (Join-AssetSource -SourcePath $toolsStylePaths[0] -ExtensionPath $toolsStylePaths[1..($toolsStylePaths.Count - 1)]).Replace('.cx-chrome', '.cx-tree-tools')
$toolsVersion = Get-AssetHash ($toolsBody + $toolsStyle)
$toolsHeader = @'
(function(global) {
"use strict";
const installed = new WeakSet();
global.CanopyXTreeTools = {version:"__VERSION__", install(context) {
if (installed.has(context.TreeGrid.prototype)) return;
const {TreeGrid,h,setText,fill,numberFormat,watchFlyout,columnWidth,prepareWidth,cellText,cellValue,isCellObject,foldText,formatting,
sortKey,compareKeys,EXPORT_FORMATS,exportFormat,exportTimeout,INDENT,MAX_PROTOCOL_INTEGER,hostControl,detailCell,HostCellContext,disposeHostSlot} = context;
const EXPORT_IMPL = {};
'@
$toolsFooter = @'
installed.add(TreeGrid.prototype);
}};
})(typeof window !== "undefined" ? window : globalThis);
'@
$toolsScript = Compress-ScriptSpacing (($toolsHeader.Replace('__VERSION__', $toolsVersion).Replace("`r`n", "`n")) + "`n" + $toolsBody + $toolsFooter.Replace("`r`n", "`n") + "`n")
$toolsScriptName = 'canopyx-tree-tools.' + (Get-AssetHash $toolsScript) + '.js'
$toolsStyleName = 'canopyx-tree-tools.' + (Get-AssetHash $toolsStyle) + '.css'
$assets += @(@{ Generated = $toolsScript; Target = 'CanopyX.Html/Assets/canopyx-tree-tools.js' },
    @{ Generated = $toolsStyle; Target = 'CanopyX.Html/Assets/canopyx-tree-tools.css' })

foreach ($asset in $assets) {
    $sourcePath = if ($asset.Source) { Join-Path $root $asset.Source } else { $null }
    $targetPath = Join-Path $root $asset.Target
    $extensionPath = if ($asset.Extension) { @($asset.Extension | ForEach-Object { Join-Path $root $_ }) } else { $null }
    $grid = [bool]($asset.Extension | Where-Object { $_ -like '*canopyx.grid.source' })
    $generated = if ($asset.Generated) { $asset.Generated } else { Join-AssetSource -SourcePath $sourcePath -ExtensionPath $extensionPath -GridRuntime:$grid }
    $generated = $generated.Replace('__CX_FILTER_VERSION__', $editorVersion).Replace('__CX_FILTER_SCRIPT__', $editorScriptName).Replace('__CX_FILTER_STYLE__', $editorStyleName)
    $generated = $generated.Replace('__CX_EXPORT_VERSION__', $exportVersion).Replace('__CX_EXPORT_SCRIPT__', $exportScriptName)
    $generated = $generated.Replace('__CX_HISTORY_VERSION__', $historyVersion).Replace('__CX_HISTORY_SCRIPT__', $historyScriptName)
    $generated = $generated.Replace('__CX_TOOLS_VERSION__', $toolsVersion).Replace('__CX_TOOLS_SCRIPT__', $toolsScriptName).Replace('__CX_TOOLS_STYLE__', $toolsStyleName)
    if ($asset.Folding) {
        if (-not $generated.Contains('__CANOPYX_FOLD_PAIRS__')) { throw 'The browser search folding marker is missing.' }
        $generated = $generated.Replace('__CANOPYX_FOLD_PAIRS__', $foldPairs)
    }
    if ($asset.Module) { $generated = ConvertTo-Module -Content $generated -Grid:([bool]$asset.Grid) }
    if ($asset.Folding) { $generated = Compress-ScriptSpacing -Content $generated }
    if (-not $asset.Generated -and $asset.Target.EndsWith('.css')) { $generated = Compress-StyleSpacing -Content $generated }

    if ($Check) {
        $current = if (Test-Path $targetPath) { [System.IO.File]::ReadAllText($targetPath).Replace("`r`n", "`n").Replace("`r", "`n") } else { '' }
        if ($current -ne $generated) {
            throw "Generated asset is out of date: $($asset.Target). Run Build/Sync-Assets.ps1."
        }

        continue
    }

    [System.IO.File]::WriteAllText($targetPath, $generated, [System.Text.UTF8Encoding]::new($false))
}
