namespace CanopyX;

// The texts flows write themselves (docs/flow.md#labels-and-right-to-left). A flow document carries the changed ones.
public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the accessible name of the step rail. Default "Steps".</summary>
    public string FlowSteps { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the step position, including <c>{current}</c> and <c>{count}</c>. Default "Step {current} of {count}".</summary>
    public string FlowStepOf { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what a screen reader hears on a step change, including <c>{current}</c>, <c>{count}</c> and <c>{title}</c>. Default "Step {current} of {count}, {title}".</summary>
    public string FlowStepAnnounce { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that validates the step and moves on. Default "Next".</summary>
    public string FlowNext { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that goes back a step. Default "Back".</summary>
    public string FlowBack { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the submit button when the flow names none. Default "Submit".</summary>
    public string FlowSubmit { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the submit button while the host answers. Default "Submitting…".</summary>
    public string FlowSubmitting { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the title of a review step without one. Default "Check your answers".</summary>
    public string FlowReviewTitle { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the visible text of a review row's Change button. Default "Change".</summary>
    public string FlowChange { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of a Change button, including <c>{field}</c>. Default "Change {field}".</summary>
    public string FlowChangeField { get => Get(); set => Set(value); }
    /// <summary>Gets or sets an empty answer on the review page. Default "Not provided".</summary>
    public string FlowNotProvided { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the mark after an optional field's label. Default "(optional)".</summary>
    public string FlowOptional { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the state of an optional step in the rail. Default "Optional".</summary>
    public string FlowStepOptional { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the state of a complete step. Default "Complete".</summary>
    public string FlowStepComplete { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the state of the current step. Default "Current step".</summary>
    public string FlowStepCurrent { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the state of a step with errors, including <c>{count}</c>. Default "Errors: {count}".</summary>
    public string FlowStepErrors { get => Get(); set => Set(value); }
    /// <summary>Gets or sets why a linear flow's later step cannot open yet. Default "Complete the earlier steps first".</summary>
    public string FlowStepLocked { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the state of a step not visited yet. Default "Not started".</summary>
    public string FlowStepNotStarted { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the title of a step's error summary. Default "Fix these before you continue".</summary>
    public string FlowErrorSummary { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the review banner when the answers can be submitted. Default "Ready to submit".</summary>
    public string FlowReady { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the review banner with errors, including <c>{count}</c>. Default "Errors to fix: {count}".</summary>
    public string FlowNotReady { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the review banner's warnings, including <c>{count}</c>. Default "Warnings: {count}".</summary>
    public string FlowWarnings { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the review switch that shows only changed answers. Default "Show changes only".</summary>
    public string FlowChangesOnly { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the review page when no answer changed. Default "No answers have changed.".</summary>
    public string FlowNoChanges { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what a changed answer was, including <c>{value}</c>. Default "Was: {value}".</summary>
    public string FlowWas { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the number of changed answers, including <c>{count}</c>. Default "Changed answers: {count}".</summary>
    public string FlowChangedCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a secret the reader typed, on the review page. Default "Set".</summary>
    public string FlowSecretSet { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a stored secret that stays. Default "Unchanged".</summary>
    public string FlowSecretKept { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a secret without a value. Default "Not set".</summary>
    public string FlowSecretNotSet { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the hint of a secret whose stored value stays when left blank. Default "A value is saved. Leave blank to keep it.".</summary>
    public string FlowSecretHint { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the visible text of the button that reveals a secret. Default "Show".</summary>
    public string FlowSecretShow { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the visible text of the button that masks a secret again. Default "Hide".</summary>
    public string FlowSecretHide { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of the reveal button, including <c>{field}</c>. Default "Show {field}".</summary>
    public string FlowSecretReveal { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a toggle that is on, on the review page. Default "On".</summary>
    public string FlowOn { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a toggle that is off, on the review page. Default "Off".</summary>
    public string FlowOff { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the visible text of a list's Add button. Default "Add".</summary>
    public string FlowAdd { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of a list's Add button, including <c>{field}</c>. Default "Add to {field}".</summary>
    public string FlowAddItem { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of a list row's Remove button, including <c>{item}</c>. Default "Remove {item}".</summary>
    public string FlowRemoveItem { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of a list row, including <c>{field}</c> and <c>{index}</c>. Default "{field}, item {index}".</summary>
    public string FlowItemLabel { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the multiple choice button that checks every option. Default "Select all".</summary>
    public string FlowSelectAll { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the multiple choice button that clears every option. Default "Clear".</summary>
    public string FlowSelectNone { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the multiple choice count, including <c>{count}</c> and <c>{total}</c>. Default "{count} of {total} selected".</summary>
    public string FlowSelectedCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of a duration's unit. Default "Unit".</summary>
    public string FlowUnit { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the seconds unit of a duration. Default "seconds".</summary>
    public string FlowUnitSeconds { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the minutes unit of a duration. Default "minutes".</summary>
    public string FlowUnitMinutes { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the hours unit of a duration. Default "hours".</summary>
    public string FlowUnitHours { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the days unit of a duration. Default "days".</summary>
    public string FlowUnitDays { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a duration in seconds on the review page, including <c>{count}</c>, with plural forms. Default "[one]{count} second[other]{count} seconds".</summary>
    public string FlowSeconds { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a duration in minutes, including <c>{count}</c>, with plural forms. Default "[one]{count} minute[other]{count} minutes".</summary>
    public string FlowMinutes { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a duration in hours, including <c>{count}</c>, with plural forms. Default "[one]{count} hour[other]{count} hours".</summary>
    public string FlowHours { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a duration in days, including <c>{count}</c>, with plural forms. Default "[one]{count} day[other]{count} days".</summary>
    public string FlowDays { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for a duration that is not a whole number, including <c>{field}</c>. Default "{field} must be a whole number.".</summary>
    public string FlowDurationInvalid { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for too few items, including <c>{field}</c> and <c>{min}</c>. Default "{field} needs at least {min}.".</summary>
    public string FlowItemsMin { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for too many items, including <c>{field}</c> and <c>{max}</c>. Default "{field} allows at most {max}.".</summary>
    public string FlowItemsMax { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for a list item that is not an email address, including <c>{item}</c>. Default "“{item}” is not an email address.".</summary>
    public string FlowItemEmail { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for a list item that is not a host name, including <c>{item}</c>. Default "“{item}” is not a host name.".</summary>
    public string FlowItemHost { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for a list item that is not an IP address, including <c>{item}</c>. Default "“{item}” is not an IP address.".</summary>
    public string FlowItemIp { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for a list item that is not a network range, including <c>{item}</c>. Default "“{item}” is not a network range.".</summary>
    public string FlowItemCidr { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for a list item that is not a web address, including <c>{item}</c>. Default "“{item}” is not a web address.".</summary>
    public string FlowItemUrl { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message for a list item that does not match its pattern, including <c>{item}</c>. Default "“{item}” does not have the expected format.".</summary>
    public string FlowItemPattern { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the title of the result after the host saved the answers. Default "Saved".</summary>
    public string FlowSaved { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the title of the progress panel after the host accepted longer work. Default "In progress".</summary>
    public string FlowAccepted { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the progress of accepted work, including <c>{done}</c> and <c>{total}</c>. Default "{done} of {total}".</summary>
    public string FlowProgress { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the review banner when the host reports a conflict. Default "These settings changed while you were editing them.".</summary>
    public string FlowConflict { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that asks the host to reload the current settings. Default "Reload current settings".</summary>
    public string FlowReload { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the review banner when the host answered an error without a message. Default "The answers were not submitted.".</summary>
    public string FlowNotSubmitted { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the review banner when nothing answered the proposal. Default "No host received the answers.".</summary>
    public string FlowNoHost { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the result panel's button that starts the flow again. Default "Start another".</summary>
    public string FlowStartAgain { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that copies a value shown once. Default "Copy".</summary>
    public string FlowCopy { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement after a value was copied. Default "Copied".</summary>
    public string FlowCopied { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the acknowledgement that a value shown once was saved. Default "I have saved it".</summary>
    public string FlowSavedIt { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the note beside a value shown once. Default "Shown only once. Copy it now.".</summary>
    public string FlowShownOnce { get => Get(); set => Set(value); }
}
