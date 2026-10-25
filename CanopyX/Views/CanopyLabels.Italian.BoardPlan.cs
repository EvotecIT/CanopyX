// Generated from CanopyX/Views/Locales/labels.json by Build/Sync-Assets.ps1.
namespace CanopyX;

public sealed partial class CanopyLabels {
    private static CanopyLabels WithItalianBoardPlan(CanopyLabels labels) {
        labels.BoardLane = "Corsia";
        labels.BoardUnassigned = "Non assegnato";
        labels.BoardEmpty = "Nessun record in questa corsia";
        labels.BoardWip = "{count} / {limit}";
        labels.BoardWipFull = "{lane} ha raggiunto il limite di lavoro ({limit}).";
        labels.BoardMove = "Sposta nella corsia";
        labels.BoardMoved = "{title} spostato in {lane}.";
        labels.BoardRejected = "Spostamento non accettato.";
        labels.BoardPending = "In attesa dell’accettazione dello spostamento…";
        labels.BoardPartial = "Visualizzati i primi {count} record. Restringi i filtri per vedere gli altri.";
        labels.BoardKeys = "Alt+Sinistra o Alt+Destra sposta tra le corsie; Su e Giù scorre le schede.";
        labels.PlanMilestone = "Traguardo";
        labels.PlanCritical = "Percorso critico";
        labels.PlanBaseline = "Piano base: {start} – {end}";
        labels.PlanDependency = "{from} termina prima dell’inizio di {to}";
        labels.PlanDependencyConflict = "Conflitto di dipendenza con {task}";
        labels.PlanOverlapConflict = "Si sovrappone a {task}";
        labels.PlanIncomplete = "La rete completa delle attività non è disponibile; l’host deve verificare questa proposta.";
        labels.PlanInvalidRange = "L’attività deve terminare al momento dell’inizio o dopo.";
        labels.PlanInvalidResource = "Scegli una risorsa per l’attività.";
        labels.PlanProposal = "Proposta {task}: {start} – {end}";
        labels.PlanMoveHint = "Alt+Sinistra o Alt+Destra propone una data; Alt+Su o Alt+Giù propone una risorsa.";
        labels.PlanActual = "Effettivo";
        labels.PlanPending = "Proposta in attesa dell’host";
        labels.PlanBaselineLabel = "Piano base";
        labels.PlanDependencies = "Dipendenze";
        return labels;
    }
}
