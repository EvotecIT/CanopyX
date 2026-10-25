// Generated from CanopyX/Views/Locales/labels.json by Build/Sync-Assets.ps1.
namespace CanopyX;

public sealed partial class CanopyLabels {
    private static CanopyLabels WithPolishBoardPlan(CanopyLabels labels) {
        labels.BoardLane = "Tor";
        labels.BoardUnassigned = "Nieprzypisane";
        labels.BoardEmpty = "Brak rekordów w tym torze";
        labels.BoardWip = "{count} / {limit}";
        labels.BoardWipFull = "Tor {lane} osiągnął limit pracy ({limit}).";
        labels.BoardMove = "Przenieś do toru";
        labels.BoardMoved = "Przeniesiono {title} do {lane}.";
        labels.BoardRejected = "Przeniesienie nie zostało zaakceptowane.";
        labels.BoardPending = "Oczekiwanie na akceptację przeniesienia…";
        labels.BoardPartial = "Wyświetlono pierwsze {count} rekordów. Zawęź filtry, aby zobaczyć pozostałe.";
        labels.BoardKeys = "Alt+Lewo lub Alt+Prawo przenosi między torami; Góra i Dół przegląda karty.";
        labels.PlanMilestone = "Kamień milowy";
        labels.PlanCritical = "Ścieżka krytyczna";
        labels.PlanBaseline = "Plan bazowy: {start} – {end}";
        labels.PlanDependency = "{from} kończy się przed rozpoczęciem {to}";
        labels.PlanDependencyConflict = "Konflikt zależności z {task}";
        labels.PlanOverlapConflict = "Nakłada się na {task}";
        labels.PlanIncomplete = "Pełna sieć zadań jest niedostępna; host musi sprawdzić tę propozycję.";
        labels.PlanInvalidRange = "Zadanie musi kończyć się w chwili rozpoczęcia lub później.";
        labels.PlanInvalidResource = "Wybierz zasób zadania.";
        labels.PlanProposal = "Propozycja {task}: {start} – {end}";
        labels.PlanMoveHint = "Alt+Lewo lub Alt+Prawo proponuje nową datę; Alt+Góra lub Alt+Dół proponuje zasób.";
        labels.PlanActual = "Rzeczywiste";
        labels.PlanPending = "Propozycja oczekuje na hosta";
        labels.PlanBaselineLabel = "Plan bazowy";
        labels.PlanDependencies = "Zależności";
        return labels;
    }
}
