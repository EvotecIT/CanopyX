// Generated from CanopyX/Views/Locales/labels.json by Build/Sync-Assets.ps1.
namespace CanopyX;

public sealed partial class CanopyLabels {
    private static CanopyLabels WithFrenchAnalysis(CanopyLabels labels) {
        labels.GridCalculationAdd = "Ajouter une colonne calculée";
        labels.GridCalculationTitle = "Titre de colonne";
        labels.GridCalculationId = "ID de colonne";
        labels.GridCalculationExpression = "Expression";
        labels.GridCalculationError = "Erreur de calcul : {error}";
        labels.GridCalculationInvalid = "Vérifiez l’expression, les références de colonnes et le type de résultat.";
        labels.GridCalculationHelp = "Utilisez [columnId], l’arithmétique, IF, COALESCE, ROUND, CONCAT, DATEPART ou DATEDIFF.";
        labels.GridCalculationNumber = "Nombre";
        labels.GridCalculationDate = "Date et heure";
        labels.GridPivot = "Tableau croisé";
        labels.GridPivotRows = "Groupes de lignes";
        labels.GridPivotColumns = "Groupes de colonnes";
        labels.GridPivotValues = "Valeurs";
        labels.GridPivotFlat = "Afficher les enregistrements";
        labels.GridPivotConfigure = "Configurer le tableau croisé";
        labels.GridPivotOther = "Autres";
        labels.GridPivotLimited = "{shown} chemins de colonnes sur {total} affichés ; les autres sont regroupés dans Autres. Les sous-totaux incluent toutes les valeurs descendantes correspondantes.";
        labels.GridPivotColumn = "Choisir une colonne";
        labels.GridPivotTopN = "Premières colonnes";
        labels.GridPivotSort = "Trier les lignes par total";
        labels.GridPivotDrill = "Afficher les enregistrements pour {row}, {column}";
        labels.GridPivotReturn = "Revenir au tableau croisé";
        labels.GridPivotInvalid = "Choisissez des axes valides et au moins une valeur.";
        labels.GridShowAs = "Afficher les valeurs en";
        labels.GridShowAsValue = "Valeur";
        labels.GridShowAsPercentGrandTotal = "en % du total";
        labels.GridShowAsPercentParent = "en % du groupe parent";
        labels.GridShowAsPercentColumn = "en % de la colonne";
        labels.GridShowAsPercentRow = "en % de la ligne";
        labels.GridShowAsRunningTotal = "en cumul";
        labels.GridShowAsRank = "en rang";
        labels.GridShowAsDifference = "en différence avec la valeur précédente";
        labels.GridShowAsPercentChange = "en variation en % de la valeur précédente";
        labels.GridBucket = "Intervalle";
        labels.GridBucketNone = "Valeurs exactes";
        labels.GridBucketDay = "Jour";
        labels.GridBucketWeek = "Semaine";
        labels.GridBucketMonth = "Mois";
        labels.GridBucketQuarter = "Trimestre";
        labels.GridBucketYear = "Année";
        labels.GridBucketHour = "Heure du jour";
        labels.GridBucketWeekday = "Jour de la semaine";
        labels.GridBucketWidth = "Largeur de l’intervalle";
        labels.GridBucketEdges = "Bornes des intervalles";
        labels.GridBucketOrigin = "Origine des intervalles";
        labels.GridBucketInvalid = "Saisissez des paramètres d’intervalle valides.";
        return labels;
    }
}
