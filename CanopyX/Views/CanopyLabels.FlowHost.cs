namespace CanopyX;

// The texts host-connected flows write themselves: options, checks, pickers, records, task lists, dialogs, drafts, presets,
// the equivalent command, the preview and the confirmation (docs/flow.md). A flow document carries the changed ones.
public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the text for a host hook that ran past the flow's timeout. Default "The host did not answer in time.".</summary>
    public string FlowTimedOut { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a host feature the page has no hook or endpoint route for. Default "No host answers this.".</summary>
    public string FlowNoHostHook { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the line under a field while its host options load. Default "Loading options…".</summary>
    public string FlowOptionsLoading { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the line under a field whose host options failed, including <c>{message}</c>. Default "The options could not load: {message}".</summary>
    public string FlowOptionsFailed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the button that asks the host again. Default "Try again".</summary>
    public string FlowRetry { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the review page's button that runs a server check again. Default "Run again".</summary>
    public string FlowRunAgain { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of the review page's button that runs a server check again, <c>{check}</c> the check. Default "Run “{check}” again".</summary>
    public string FlowRunCheckAgain { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the line in a host section while its fields load. Default "Loading fields…".</summary>
    public string FlowFieldsLoading { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the line in a host section whose fields failed, including <c>{message}</c>. Default "The fields could not load: {message}".</summary>
    public string FlowFieldsFailed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the quiet mark beside a field whose answer differs from the preset. Default "Changed".</summary>
    public string FlowChangedMark { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the accessible name of a records table's action column. Default "Actions".</summary>
    public string FlowRecordActions { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the accessible name of a records cell, including <c>{column}</c> and <c>{row}</c>. Default "{column}, row {row}".</summary>
    public string FlowRecordCell { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the accessible name of a records row's Remove button, including <c>{row}</c>. Default "Remove row {row}".</summary>
    public string FlowRecordRemove { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the button that adds a records row. Default "Add row".</summary>
    public string FlowRecordAdd { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for an empty records table. Default "No rows yet.".</summary>
    public string FlowRecordsEmpty { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a records cell's problem, including <c>{row}</c> and <c>{message}</c>. Default "Row {row}: {message}".</summary>
    public string FlowRecordProblem { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a records answer on the review page, including <c>{count}</c>. Default "[one]{count} row[other]{count} rows".</summary>
    public string FlowRecordsCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the end of a long list of chosen records, including <c>{count}</c>. Default "and {count} more".</summary>
    public string FlowPickMore { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for how many records a pick step holds, including <c>{count}</c>. Default "[one]{count} chosen[other]{count} chosen".</summary>
    public string FlowPickCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the heading and name of a pick step's tray. Default "Chosen".</summary>
    public string FlowPickChosen { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for an empty tray. Default "Nothing chosen yet.".</summary>
    public string FlowPickNone { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the heading of a step's checks and of the review page's check results. Default "Checks".</summary>
    public string FlowChecks { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the button that stops a running check, closes a dialog flow or a naming box. Default "Cancel".</summary>
    public string FlowCancel { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the switch that accepts a check's warning. Default "Continue despite the warning".</summary>
    public string FlowCheckAcknowledge { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a running check. Default "Checking…".</summary>
    public string FlowCheckRunning { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a check that has not run. Default "Not run".</summary>
    public string FlowCheckNotRun { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a check whose fields changed after it ran. Default "The answers changed since the check".</summary>
    public string FlowCheckStale { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a passed check, including <c>{time}</c>. Default "Passed at {time}".</summary>
    public string FlowCheckPassed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a check that warned, including <c>{time}</c>. Default "Warning at {time}".</summary>
    public string FlowCheckWarning { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a failed check, including <c>{time}</c>. Default "Failed at {time}".</summary>
    public string FlowCheckFailed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a check answer that is not a pass, warning or fail. Default "The check gave no usable answer.".</summary>
    public string FlowCheckInvalid { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a required check that has not run on the current answers, including <c>{check}</c>. Default "Run “{check}” on these answers.".</summary>
    public string FlowCheckNeeded { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a required check that failed, including <c>{check}</c>. Default "“{check}” did not pass.".</summary>
    public string FlowCheckNotPassed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a required check whose warning is not accepted, including <c>{check}</c>. Default "Confirm the warning of “{check}”.".</summary>
    public string FlowCheckConfirmWarning { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the heading of a task list's hub. Default "Tasks".</summary>
    public string FlowTasks { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a task list's progress, including <c>{done}</c> and <c>{count}</c>. Default "{done} of {count} tasks complete".</summary>
    public string FlowTasksProgress { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a task the host says needs action. Default "Needs action".</summary>
    public string FlowTaskNeedsAction { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a task the host blocks. Default "Cannot start yet".</summary>
    public string FlowTaskBlocked { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the hub's button that opens the review page. Default "Review and submit".</summary>
    public string FlowTasksReview { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for why the hub's button cannot go on yet. Default "Complete the required tasks first.".</summary>
    public string FlowTasksIncomplete { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a task's Back button. Default "Back to tasks".</summary>
    public string FlowBackToTasks { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a task's button that validates it and returns to the hub. Default "Save and return".</summary>
    public string FlowSaveAndReturn { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the button that saves the draft now. Default "Save draft".</summary>
    public string FlowSaveDraft { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the accessible name of a dialog flow's close button. Default "Close".</summary>
    public string FlowClose { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the question before a dialog flow with changed answers closes. Default "Discard your answers?".</summary>
    public string FlowDiscardQuestion { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the button that closes a dialog flow and drops its answers. Default "Discard".</summary>
    public string FlowDiscard { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the button that keeps a dialog flow open. Default "Keep editing".</summary>
    public string FlowKeepEditing { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for what a reader hears and sees after Save draft. Default "Draft saved".</summary>
    public string FlowDraftSaved { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a draft store that refused the draft. Default "The draft was not saved.".</summary>
    public string FlowDraftFailed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the accessible name of the resume banner. Default "Saved draft".</summary>
    public string FlowDraftFound { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the resume banner, including <c>{time}</c>. Default "You have a draft saved {time}.".</summary>
    public string FlowDraftFrom { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the warning on a draft of another baseline. Default "The settings changed after this draft was saved.".</summary>
    public string FlowDraftStale { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the button that restores a draft. Default "Resume where you left off".</summary>
    public string FlowDraftResume { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the button that drops a draft. Default "Start again".</summary>
    public string FlowDraftRestart { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the label of the preset choice. Default "Start from".</summary>
    public string FlowStartFrom { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the button that saves the answers as a preset. Default "Save as preset".</summary>
    public string FlowPresetSave { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the preset choice without a preset. Default "Defaults".</summary>
    public string FlowPresetNone { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the group of presets the host stores. Default "Saved presets".</summary>
    public string FlowPresetsSaved { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for what a reader hears after choosing a preset, including <c>{preset}</c>. Default "Started from {preset}".</summary>
    public string FlowPresetApplied { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the name box of a new preset. Default "Preset name".</summary>
    public string FlowPresetName { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a preset store that refused the preset. Default "The preset was not saved.".</summary>
    public string FlowPresetFailed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for what a reader hears after saving a preset, including <c>{preset}</c>. Default "Saved the preset {preset}".</summary>
    public string FlowPresetSaved { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the review page's preset line, including <c>{preset}</c> and <c>{count}</c>. Default "[one]Based on {preset}, {count} change[other]Based on {preset}, {count} changes".</summary>
    public string FlowPresetChanges { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the command tab of the equivalent command. Default "Command".</summary>
    public string FlowCommandTab { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the JSON patch tab of the equivalent command. Default "JSON patch".</summary>
    public string FlowPatchTab { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the title of the equivalent command panel. Default "Equivalent command".</summary>
    public string FlowCommandTitle { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the heading of the host's preview. Default "Preview".</summary>
    public string FlowPreview { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the host's preview while it loads. Default "Loading the preview…".</summary>
    public string FlowPreviewLoading { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a failed preview, including <c>{message}</c>. Default "The preview could not load: {message}".</summary>
    public string FlowPreviewFailed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for a preview without content. Default "Nothing to preview.".</summary>
    public string FlowPreviewNone { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the error of a typed confirmation, including <c>{text}</c>. Default "Type {text} exactly to continue.".</summary>
    public string FlowConfirmMismatch { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the error of an acknowledgement left unchecked. Default "Confirm this before you submit.".</summary>
    public string FlowAcknowledgeNeeded { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for the preset choice that keeps the edited settings. Default "Current settings".</summary>
    public string FlowPresetCurrent { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for what a reader hears when a picker refuses all matching records. Default "Choose the records one by one or a page at a time.".</summary>
    public string FlowPickOneByOne { get => Get(); set => Set(value); }
}
