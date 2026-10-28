// Generated from CanopyX/Views/Locales/labels.json by Build/Sync-Assets.ps1.
namespace CanopyX;

public sealed partial class CanopyLabels {
    private static CanopyLabels WithFrenchBoardPlan(CanopyLabels labels) {
        labels.BoardLane = "Colonne";
        labels.BoardUnassigned = "Non attribué";
        labels.BoardEmpty = "Aucun enregistrement dans cette colonne";
        labels.BoardWip = "{count} / {limit}";
        labels.BoardWipFull = "{lane} a atteint sa limite de travail ({limit}).";
        labels.BoardMove = "Déplacer vers la colonne";
        labels.BoardMoved = "{title} déplacé vers {lane}.";
        labels.BoardRejected = "Le déplacement a été refusé.";
        labels.BoardPending = "En attente de l’acceptation du déplacement…";
        labels.BoardPartial = "Affichage des {count} premiers enregistrements. Affinez les filtres pour voir le reste.";
        labels.BoardKeys = "Alt+Gauche ou Alt+Droite déplace entre les colonnes ; Haut et Bas parcourt les cartes.";
        labels.PlanMilestone = "Jalon";
        labels.PlanCritical = "Chemin critique";
        labels.PlanBaseline = "Référence : {start} – {end}";
        labels.PlanDependency = "{from} se termine avant le début de {to}";
        labels.PlanDependencyConflict = "Conflit de dépendance avec {task}";
        labels.PlanOverlapConflict = "Chevauche {task}";
        labels.PlanIncomplete = "Le réseau complet des tâches est indisponible ; l’hôte doit vérifier cette proposition.";
        labels.PlanInvalidRange = "La tâche doit se terminer à son début ou après.";
        labels.PlanInvalidResource = "Choisissez une ressource pour la tâche.";
        labels.PlanProposal = "Proposition {task} : {start} – {end}";
        labels.PlanMoveHint = "Alt+Gauche ou Alt+Droite propose une date ; Alt+Haut ou Alt+Bas propose une ressource.";
        labels.PlanActual = "Réel";
        labels.PlanPending = "Proposition en attente de l’hôte";
        labels.PlanBaselineLabel = "Référence";
        labels.PlanDependencies = "Dépendances";
        labels.PlanConflict = "Conflit";
        return labels;
    }
}
