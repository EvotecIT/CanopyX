// Generated from CanopyX/Views/Locales/labels.json by Build/Sync-Assets.ps1.
namespace CanopyX;

public sealed partial class CanopyLabels {
    private static CanopyLabels WithFrenchRowActions(CanopyLabels labels) {
        labels.RowActionColumn = "Actions";
        labels.RowActionMore = "Plus d’actions";
        labels.RowActionLocked = "Lecture seule";
        labels.RowActionDismiss = "Ignorer";
        labels.RowActionPending = "{action} : en cours";
        labels.RowActionDone = "{action} : terminé";
        labels.RowActionRejected = "{action} n’a pas été effectué.";
        labels.RowActionFailed = "Échec de {action} : {error}";
        return labels;
    }
}
