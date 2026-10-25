// Generated from CanopyX/Views/Locales/labels.json by Build/Sync-Assets.ps1.
namespace CanopyX;

public sealed partial class CanopyLabels {
    private static CanopyLabels WithSpanishBoardPlan(CanopyLabels labels) {
        labels.BoardLane = "Columna";
        labels.BoardUnassigned = "Sin asignar";
        labels.BoardEmpty = "No hay registros en esta columna";
        labels.BoardWip = "{count} / {limit}";
        labels.BoardWipFull = "{lane} ha alcanzado su límite de trabajo ({limit}).";
        labels.BoardMove = "Mover a columna";
        labels.BoardMoved = "{title} se ha movido a {lane}.";
        labels.BoardRejected = "El movimiento no se ha aceptado.";
        labels.BoardPending = "Esperando la aceptación del movimiento…";
        labels.BoardPartial = "Se muestran los primeros {count} registros. Limite los filtros para ver el resto.";
        labels.BoardKeys = "Use Alt+Izquierda o Alt+Derecha para mover entre columnas; Arriba y Abajo para explorar tarjetas.";
        labels.PlanMilestone = "Hito";
        labels.PlanCritical = "Ruta crítica";
        labels.PlanBaseline = "Línea base: {start} – {end}";
        labels.PlanDependency = "{from} termina antes de que empiece {to}";
        labels.PlanDependencyConflict = "Conflicto de dependencia con {task}";
        labels.PlanOverlapConflict = "Se solapa con {task}";
        labels.PlanIncomplete = "La red completa de tareas no está disponible; el host debe comprobar esta propuesta.";
        labels.PlanInvalidRange = "La tarea debe terminar en su inicio o después.";
        labels.PlanInvalidResource = "Elija un recurso para la tarea.";
        labels.PlanProposal = "Propuesta {task}: {start} – {end}";
        labels.PlanMoveHint = "Alt+Izquierda o Alt+Derecha propone una fecha; Alt+Arriba o Alt+Abajo propone un recurso.";
        labels.PlanActual = "Real";
        labels.PlanPending = "Propuesta pendiente del host";
        labels.PlanBaselineLabel = "Línea base";
        labels.PlanDependencies = "Dependencias";
        return labels;
    }
}
