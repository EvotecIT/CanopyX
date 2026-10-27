namespace CanopyX.Tests.Playback;

internal static class TimeSliderFixtures {
    internal static readonly DateTimeOffset At = new(2026, 10, 25, 10, 0, 0, TimeSpan.Zero);

    internal static CanopyMatrix MakeMatrix(string label = "Service health", string id = "health", int rows = 2) {
        var view = new CanopyMatrix(id, label);
        view.State("ok", "Healthy", CanopyTone.Success, CanopyMatrixSymbol.Check)
            .State("late", "Delayed", CanopyTone.Warning, CanopyMatrixSymbol.Clock, attention: true);
        view.Columns.Item("east", "East");
        for (var i = 0; i < rows; i++) {
            view.Rows.Item("service-" + i, label + " service " + i);
            view.Set("service-" + i, "east", "ok");
        }

        return view;
    }

    internal static CanopyPropagation Propagation(string label = "Service rollout", string id = "rollout") {
        var view = new CanopyPropagation(id, label) { Start = At, AsOf = At.AddMinutes(2) };
        view.Witness("east", label + " East", CanopyPropagationState.Converged).FirstSeen = At;
        view.Witness("west", label + " West", CanopyPropagationState.Propagating);
        return view;
    }

    internal static CanopyMatrix MatrixSlider() {
        var view = MakeMatrix("Parent matrix");
        view.TimeSlider = new CanopyTimeSlider<CanopyMatrix>();
        view.TimeSlider.Snapshots.Add(new(At, MakeMatrix("Earlier matrix"), "Before"));
        view.TimeSlider.Snapshots.Add(new(At.AddMinutes(1), MakeMatrix("Latest matrix"), "After"));
        return view;
    }

    internal static CanopyPropagation PropagationSlider() {
        var view = Propagation("Parent rollout");
        view.TimeSlider = new CanopyTimeSlider<CanopyPropagation>();
        view.TimeSlider.Snapshots.Add(new(At, Propagation("Earlier rollout"), "Before"));
        view.TimeSlider.Snapshots.Add(new(At.AddMinutes(1), Propagation("Latest rollout"), "After"));
        return view;
    }
}
