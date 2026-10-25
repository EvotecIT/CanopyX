// Generated from CanopyX/Views/Locales/labels.json by Build/Sync-Assets.ps1.
namespace CanopyX;

public sealed partial class CanopyLabels {
    private static CanopyLabels WithGermanBoardPlan(CanopyLabels labels) {
        labels.BoardLane = "Spalte";
        labels.BoardUnassigned = "Nicht zugewiesen";
        labels.BoardEmpty = "Keine Datensätze in dieser Spalte";
        labels.BoardWip = "{count} / {limit}";
        labels.BoardWipFull = "{lane} hat das Arbeitslimit erreicht ({limit}).";
        labels.BoardMove = "In Spalte verschieben";
        labels.BoardMoved = "{title} nach {lane} verschoben.";
        labels.BoardRejected = "Verschiebung wurde nicht angenommen.";
        labels.BoardPending = "Warten auf Annahme der Verschiebung…";
        labels.BoardPartial = "Die ersten {count} Datensätze werden angezeigt. Filter eingrenzen, um weitere zu sehen.";
        labels.BoardKeys = "Alt+Links oder Alt+Rechts verschiebt zwischen Spalten; Auf und Ab blättert durch Karten.";
        labels.PlanMilestone = "Meilenstein";
        labels.PlanCritical = "Kritischer Pfad";
        labels.PlanBaseline = "Basisplan: {start} – {end}";
        labels.PlanDependency = "{from} endet vor Beginn von {to}";
        labels.PlanDependencyConflict = "Abhängigkeitskonflikt mit {task}";
        labels.PlanOverlapConflict = "Überschneidung mit {task}";
        labels.PlanIncomplete = "Das vollständige Aufgabennetz ist nicht verfügbar; der Host muss diesen Vorschlag prüfen.";
        labels.PlanInvalidRange = "Die Aufgabe muss bei oder nach ihrem Beginn enden.";
        labels.PlanInvalidResource = "Eine Aufgabenressource wählen.";
        labels.PlanProposal = "Vorschlag {task}: {start} – {end}";
        labels.PlanMoveHint = "Alt+Links oder Alt+Rechts schlägt ein neues Datum vor; Alt+Auf oder Alt+Ab eine Ressource.";
        labels.PlanActual = "Ist";
        labels.PlanPending = "Vorschlag wartet auf den Host";
        labels.PlanBaselineLabel = "Basisplan";
        labels.PlanDependencies = "Abhängigkeiten";
        return labels;
    }
}
