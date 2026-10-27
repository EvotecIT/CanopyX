using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyLabels {
    private static Dictionary<string, string> WithUiDefaults(Dictionary<string, string> defaults) {
        defaults[nameof(TabsMore)] = "More";
        defaults[nameof(TabsMoreSelected)] = "More: {label}";
        defaults[nameof(TabsScrollPrevious)] = "Previous tabs";
        defaults[nameof(TabsScrollNext)] = "Next tabs";
        defaults[nameof(TabsSection)] = "Section";
        defaults[nameof(TabsPosition)] = "{current} of {total}";
        defaults[nameof(TabsPause)] = "Pause";
        defaults[nameof(TabsPlay)] = "Play";
        defaults[nameof(TabsMotionDisabled)] = "Automatic tabs are disabled by reduced motion";
        defaults[nameof(StepperStepOf)] = "Step {current} of {total}";
        defaults[nameof(StepperBack)] = "Back";
        defaults[nameof(StepperNext)] = "Next";
        defaults[nameof(StepperFinish)] = "Finish";
        defaults[nameof(StepperSkip)] = "Skip";
        defaults[nameof(StepperSaveDraft)] = "Save draft";
        defaults[nameof(StepperAllSteps)] = "All steps";
        defaults[nameof(StepperOptional)] = "Optional";
        defaults[nameof(StepperCompleted)] = "Completed";
        defaults[nameof(StepperSkipped)] = "Skipped";
        defaults[nameof(StepperIssues)] = "{count} issues to fix";
        defaults[nameof(StepperIssue)] = "1 issue to fix";
        defaults[nameof(DialogClose)] = "Close";
        defaults[nameof(DrawerClose)] = "Close";
        defaults[nameof(DrawerPrevious)] = "Previous record";
        defaults[nameof(DrawerNext)] = "Next record";
        defaults[nameof(StateLoading)] = "Loading…";
        defaults[nameof(StateRetry)] = "Retry";
        defaults[nameof(StateDetails)] = "Details";
        return defaults;
    }
}
