namespace CanopyX;

// The texts the change views write themselves (docs/changes.md): the diff, the change list and the propagation view. Their documents carry the changed ones.
public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the layout choice that shows one column. Default "Inline".</summary>
    public string ChangeInline { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the layout choice that shows two columns. Default "Side by side".</summary>
    public string ChangeSplit { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of the layout choice. Default "Layout".</summary>
    public string ChangeLayout { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that copies the unified diff. Default "Copy diff".</summary>
    public string ChangeCopyDiff { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what the reader hears after a copy. Default "Copied".</summary>
    public string ChangeCopied { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what the reader hears when the clipboard refused a copy. Default "Could not copy".</summary>
    public string ChangeCopyFailed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that moves to the next change. Default "Next change".</summary>
    public string ChangeNext { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that moves to the previous change. Default "Previous change".</summary>
    public string ChangePrevious { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what the reader hears after moving to a change, including <c>{index}</c> and <c>{count}</c>. Default "Change {index} of {count}".</summary>
    public string ChangePosition { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that opens a folded region, including <c>{count}</c>, with plural forms. Default "[one]Show {count} more line[other]Show {count} more lines".</summary>
    public string ChangeShowLines { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a region the diff has no text for, including <c>{count}</c>, with plural forms. Default "[one]{count} unchanged line not included[other]{count} unchanged lines not included".</summary>
    public string ChangeHiddenLines { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of the added and removed counts, including <c>{added}</c> and <c>{removed}</c>. Default "Lines added: {added}, removed: {removed}".</summary>
    public string ChangeLineCounts { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what a screen reader hears before an added line, including <c>{line}</c>. Default "Added line {line}".</summary>
    public string ChangeLineAdded { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what a screen reader hears before a removed line, including <c>{line}</c>. Default "Removed line {line}".</summary>
    public string ChangeLineRemoved { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what a screen reader hears before an unchanged line, including <c>{line}</c>. Default "Line {line}".</summary>
    public string ChangeLineContext { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the title of the earlier side when the diff names none. Default "Before".</summary>
    public string ChangeBefore { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the title of the later side when the diff names none. Default "After".</summary>
    public string ChangeAfter { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what a binary file's diff says. Default "Binary file: compared by size and hash, not by lines.".</summary>
    public string ChangeBinary { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what a diff without content says when the host gives no message. Default "The content of this file is not available.".</summary>
    public string ChangeUnavailable { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what a diff of equal texts says. Default "The text did not change.".</summary>
    public string ChangeIdentical { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the note of a diff the host shortened. Default "Some changes are not shown: the comparison was too large.".</summary>
    public string ChangeTruncated { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what a diff says when its texts are too long for the browser to compare. Default "These texts are too long to compare here.".</summary>
    public string ChangeTooLarge { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of a diff's lines, including <c>{name}</c>. Default "Changes in {name}".</summary>
    public string ChangeDiffOf { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the badge of an added item. Default "Added".</summary>
    public string ChangeAdded { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the badge of a removed item. Default "Removed".</summary>
    public string ChangeRemoved { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the badge of a modified item. Default "Modified".</summary>
    public string ChangeModified { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the badge of a renamed item. Default "Renamed".</summary>
    public string ChangeRenamed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the switch that shows only flagged items. Default "Flagged only".</summary>
    public string ChangeFlaggedOnly { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the count of flagged items, including <c>{count}</c>, optionally with plural forms. Default "{count} flagged".</summary>
    public string ChangeFlaggedCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what the list says when nothing matches. Default "No changes to show.".</summary>
    public string ChangeNoItems { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the size row of the details. Default "Size".</summary>
    public string ChangeSize { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the hash row of the details. Default "Hash".</summary>
    public string ChangeHash { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the time row of the details. Default "Time".</summary>
    public string ChangeTime { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the tooltip and accessible name of a short hash, which copies the whole hash. Default "Copy the full hash".</summary>
    public string ChangeCopyHash { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of an item's details button, including <c>{name}</c>. Default "Details of {name}".</summary>
    public string ChangeDetails { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a folder's count, including <c>{count}</c>, with plural forms. Default "[one]{count} file[other]{count} files".</summary>
    public string ChangeFileCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the earlier path of a renamed item, including <c>{path}</c>. Default "from {path}".</summary>
    public string ChangeFrom { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that shows more items. Default "Show more".</summary>
    public string ChangeShowMore { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the heading of an item's flags in its details. Default "Flags".</summary>
    public string ChangeFlags { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the heading of an item's facts. Default "Details".</summary>
    public string ChangeFacts { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the group of items without a folder. Default "Top level".</summary>
    public string ChangeRoot { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the count while filters hide items, including <c>{shown}</c> and <c>{total}</c>. Default "{shown} of {total} shown".</summary>
    public string ChangeShown { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of the kind filters. Default "Show changes".</summary>
    public string ChangeFilter { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of an item's actions, including <c>{name}</c>. Default "Actions for {name}".</summary>
    public string ChangeActions { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the state of a replica that has the change. Default "Converged".</summary>
    public string ChangeConverged { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the state of a replica that does not have the change yet. Default "Propagating".</summary>
    public string ChangePropagating { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the state of a replica that still differs past the time it is allowed. Default "Fault".</summary>
    public string ChangeFault { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the state of a replica without current proof. Default "Unknown".</summary>
    public string ChangeUnknown { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the title of the replica column when the view names none. Default "Replica".</summary>
    public string ChangeReplica { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the title of the state column. Default "State".</summary>
    public string ChangeState { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the title of the first-seen column. Default "First seen".</summary>
    public string ChangeFirstSeen { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the title of the last-seen column. Default "Last seen".</summary>
    public string ChangeLastSeen { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the title of the lane column. Default "Delay".</summary>
    public string ChangeTimeline { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the first-seen time of a replica without the change. Default "Not seen yet".</summary>
    public string ChangeNotSeen { get => Get(); set => Set(value); }
    /// <summary>Gets or sets how long after the change it was first seen, including <c>{duration}</c>. Default "+{duration}".</summary>
    public string ChangeDelay { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the mark of the replica the change was first seen on. Default "Source".</summary>
    public string ChangeSource { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the summary when the view gives none, including <c>{converged}</c> and <c>{total}</c>. Default "{converged} of {total} have the change".</summary>
    public string ChangeProgress { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a duration in seconds, including <c>{count}</c>. Default "{count} s".</summary>
    public string ChangeSeconds { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a duration in minutes, including <c>{count}</c>. Default "{count} min".</summary>
    public string ChangeMinutes { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a duration in hours, including <c>{count}</c>. Default "{count} h".</summary>
    public string ChangeHours { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a duration in days, including <c>{count}</c>. Default "{count} d".</summary>
    public string ChangeDays { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a time in UTC, including <c>{time}</c>. Default "{time} UTC".</summary>
    public string ChangeUtcTime { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the bar's button that downloads the items the filters keep as a CSV file. Default "Export CSV".</summary>
    public string ChangeExportCsv { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the bar's button that downloads the items the filters keep as a JSON file. Default "Export JSON".</summary>
    public string ChangeExportJson { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the title of the reason field of an action that asks for one. Default "Reason".</summary>
    public string ChangeReason { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the hint of the reason field, including <c>{action}</c>. Default "{action}: say why. The reason is kept with the action.".</summary>
    public string ChangeReasonHint { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message when the reader confirms without a reason. Default "Enter a reason first.".</summary>
    public string ChangeReasonRequired { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that closes the reason field without acting. Default "Cancel".</summary>
    public string ChangeCancel { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the note when no host carries out an action, including <c>{action}</c>. Default "This page cannot carry out “{action}” itself. Copy the request to pass it on.".</summary>
    public string ChangeUnclaimed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that copies the request of an action no host carried out. Default "Copy request".</summary>
    public string ChangeCopyRequest { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the printed note of the filters in effect, including <c>{filters}</c>. Default "Filtered: {filters}".</summary>
    public string ChangeFiltered { get => Get(); set => Set(value); }
}
