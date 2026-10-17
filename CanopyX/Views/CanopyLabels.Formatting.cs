namespace CanopyX;

/// <remarks>The conditional formatting labels (Format*) are read by the formatting parts of flat grids; trees leave them out.</remarks>
public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the more-menu entry and the rule editor's title. Default "Conditional formatting".</summary>
    public string FormatRules { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of the legend. Default "Formatting legend".</summary>
    public string FormatLegend { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the prefix of a threshold band's upper bound. Default "Up to".</summary>
    public string FormatUpTo { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the prefix of the open last threshold band. Default "Above".</summary>
    public string FormatAbove { get => Get(); set => Set(value); }
    /// <summary>Gets or sets what the phone's "+N" button adds, with {count} and {rules}. Default "{count} hidden fields formatted: {rules}".</summary>
    public string FormatHiddenFlagged { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the name of a rule without a label, with {number}. Default "Rule {number}".</summary>
    public string FormatRule { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that adds a rule. Default "Add rule".</summary>
    public string FormatAddRule { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that edits a rule, with {rule}. Default "Edit {rule}".</summary>
    public string FormatEditRule { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that deletes a rule, with {rule}. Default "Delete {rule}".</summary>
    public string FormatDeleteRule { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that raises a rule, with {rule}. Default "Move {rule} up".</summary>
    public string FormatMoveUp { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that lowers a rule, with {rule}. Default "Move {rule} down".</summary>
    public string FormatMoveDown { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the switch of a rule, with {rule}. Default "Apply {rule}".</summary>
    public string FormatEnableRule { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the editor's text when there are no rules. Default "No formatting rules.".</summary>
    public string FormatNoRules { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the rule name field. Default "Name".</summary>
    public string FormatName { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the rule description field. Default "Screen reader description".</summary>
    public string FormatDescription { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the switch that gives a rule a condition. Default "Only rows where".</summary>
    public string FormatOnlyRowsWhere { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a rule without a condition. Default "Every row".</summary>
    public string FormatEveryRow { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the none junction of a condition group. Default "None".</summary>
    public string FormatNone { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the target field. Default "Apply to".</summary>
    public string FormatApplyTo { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the cell target. Default "Cell".</summary>
    public string FormatTargetCell { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the row target. Default "Whole row".</summary>
    public string FormatTargetRow { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the columns target. Default "Chosen columns".</summary>
    public string FormatTargetColumns { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the style kind field. Default "Style".</summary>
    public string FormatStyle { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the highlight style. Default "Highlight".</summary>
    public string FormatHighlight { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the data bar style. Default "Data bar".</summary>
    public string FormatDataBar { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the colour scale style. Default "Colour scale".</summary>
    public string FormatColorScale { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the threshold bands style. Default "Threshold bands".</summary>
    public string FormatBands { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the tone field. Default "Tone".</summary>
    public string FormatTone { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the emphasis field. Default "Emphasis".</summary>
    public string FormatEmphasis { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the fill emphasis. Default "Fill".</summary>
    public string FormatFill { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text emphasis. Default "Text colour".</summary>
    public string FormatTextOnly { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the strong emphasis. Default "Bold fill".</summary>
    public string FormatStrong { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the icon field. Default "Icon".</summary>
    public string FormatIcon { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the no-icon choice. Default "No icon".</summary>
    public string FormatNoIcon { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the automatic choice of icons and bounds. Default "Automatic".</summary>
    public string FormatAutomatic { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the badge field. Default "Badge".</summary>
    public string FormatBadge { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text cue field. Default "Text cue".</summary>
    public string FormatCue { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the lowest bound or stop. Default "Lowest".</summary>
    public string FormatLowest { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the midpoint stop. Default "Midpoint".</summary>
    public string FormatMidpoint { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the highest bound or stop. Default "Highest".</summary>
    public string FormatHighest { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that adds a band. Default "+ Band".</summary>
    public string FormatAddBand { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the action that removes a band. Default "Remove band".</summary>
    public string FormatRemoveBand { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the save action. Default "Save rule".</summary>
    public string FormatSave { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the cancel action and the editor's close button. Default "Cancel".</summary>
    public string FormatCancel { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the legend switch. Default "Show legend".</summary>
    public string FormatShowLegend { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the error of an incomplete rule. Default "Complete the rule before saving.".</summary>
    public string FormatInvalid { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the match-case switch of a condition. Default "Match case".</summary>
    public string FormatMatchCase { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the danger tone. Default "Danger".</summary>
    public string FormatToneDanger { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the warning tone. Default "Warning".</summary>
    public string FormatToneWarning { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the success tone. Default "Success".</summary>
    public string FormatToneSuccess { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the info tone. Default "Info".</summary>
    public string FormatToneInfo { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the neutral tone. Default "Neutral".</summary>
    public string FormatToneNeutral { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the muted tone. Default "Muted".</summary>
    public string FormatToneMuted { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the notContains operator. Default "does not contain".</summary>
    public string FormatNotContains { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the endsWith operator. Default "ends with".</summary>
    public string FormatEndsWith { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the notIn operator. Default "is none of".</summary>
    public string FormatNotIn { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the between operator. Default "between".</summary>
    public string FormatBetween { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the like operator. Default "matches wildcard".</summary>
    public string FormatLike { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the matches operator. Default "matches pattern".</summary>
    public string FormatMatches { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the olderThan operator. Default "older than (days)".</summary>
    public string FormatOlderThan { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the withinLast operator. Default "within the last (days)".</summary>
    public string FormatWithinLast { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the notLike operator. Default "does not match wildcard".</summary>
    public string FormatNotLike { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the notMatches operator. Default "does not match pattern".</summary>
    public string FormatNotMatches { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the betweenExclusive operator. Default "between (exclusive)".</summary>
    public string FormatBetweenExclusive { get => Get(); set => Set(value); }
}
