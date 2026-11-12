namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the actions column's header and the name of each row's button group. Default "Actions".</summary>
    public string RowActionColumn { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the name of the button that opens a row's other actions. Default "More actions".</summary>
    public string RowActionMore { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the name of the lock a read-only row shows in place of its actions. Default "Read-only".</summary>
    public string RowActionLocked { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the name of the button that clears a row action's message. Default "Dismiss".</summary>
    public string RowActionDismiss { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears, and the busy button's description, while the host handles <c>{action}</c>. Default "{action}: working".</summary>
    public string RowActionPending { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears when the host accepted <c>{action}</c>. Default "{action}: done".</summary>
    public string RowActionDone { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the message when the host rejected <c>{action}</c> without a message of its own. Default "{action} was not carried out.".</summary>
    public string RowActionRejected { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the message when the host's hook failed or timed out, with <c>{action}</c> and <c>{error}</c>. Default "{action} failed: {error}".</summary>
    public string RowActionFailed { get => Get(); set => Set(value); }
}
