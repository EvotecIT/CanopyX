// Generated from CanopyX/Views/Locales/labels.json by Build/Sync-Assets.ps1.
namespace CanopyX;

public sealed partial class CanopyLabels {
    private static CanopyLabels WithSpanishAnalysis(CanopyLabels labels) {
        labels.GridPivotFieldOptions = "Opciones de campo";
        labels.GridCalculationResultType = "Tipo de resultado";
        labels.GridCalculationDivideZero = "División por cero";
        labels.GridCalculationAdd = "Añadir columna calculada";
        labels.GridCalculationTitle = "Título de columna";
        labels.GridCalculationId = "ID de columna";
        labels.GridCalculationExpression = "Expresión";
        labels.GridCalculationError = "Error de cálculo: {error}";
        labels.GridCalculationInvalid = "Compruebe la expresión, las referencias a columnas y el tipo de resultado.";
        labels.GridCalculationHelp = "Use [columnId], aritmética, IF, COALESCE, ROUND, CONCAT, DATEPART o DATEDIFF.";
        labels.GridCalculationNumber = "Número";
        labels.GridCalculationDate = "Fecha y hora";
        labels.GridPivot = "Tabla dinámica";
        labels.GridPivotRows = "Grupos de filas";
        labels.GridPivotColumns = "Grupos de columnas";
        labels.GridPivotValues = "Valores";
        labels.GridPivotFlat = "Mostrar registros";
        labels.GridPivotConfigure = "Ajustes de tabla dinámica";
        labels.GridPivotOther = "Otros";
        labels.GridPivotLimited = "Se muestran {shown} de {total} rutas de columnas; el resto se agrupa en Otros. Los subtotales incluyen todos los valores descendientes coincidentes.";
        labels.GridPivotColumn = "Elegir columna";
        labels.GridPivotTopN = "Columnas principales";
        labels.GridPivotSort = "Orden de filas";
        labels.GridPivotDrill = "Mostrar registros de {row}, {column}";
        labels.GridPivotReturn = "Volver a la tabla dinámica";
        labels.GridPivotInvalid = "Elige ejes válidos y al menos un valor.";
        labels.GridShowAs = "Mostrar valores como";
        labels.GridShowAsValue = "Valor";
        labels.GridShowAsPercentGrandTotal = "% del total general";
        labels.GridShowAsPercentParent = "% del total del grupo superior";
        labels.GridShowAsPercentColumn = "% del total de columna";
        labels.GridShowAsPercentRow = "% del total de fila";
        labels.GridShowAsRunningTotal = "Total acumulado";
        labels.GridShowAsRank = "Clasificación";
        labels.GridShowAsDifference = "Diferencia respecto al anterior";
        labels.GridShowAsPercentChange = "% de cambio respecto al anterior";
        labels.GridBucket = "Intervalo";
        labels.GridBucketNone = "Valores exactos";
        labels.GridBucketDay = "Día";
        labels.GridBucketWeek = "Semana";
        labels.GridBucketMonth = "Mes";
        labels.GridBucketQuarter = "Trimestre";
        labels.GridBucketYear = "Año";
        labels.GridBucketHour = "Hora del día";
        labels.GridBucketWeekday = "Día de la semana";
        labels.GridBucketWidth = "Amplitud del intervalo";
        labels.GridBucketEdges = "Límites de los intervalos";
        labels.GridBucketOrigin = "Origen de los intervalos";
        labels.GridBucketInvalid = "Introduce una configuración de intervalos válida.";
        return labels;
    }
}
