using System;
using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyLabels {
    private static void AddUiDefaults(Dictionary<string, string> defaults) {
        foreach (var entry in new Dictionary<string, string>(StringComparer.Ordinal) {
        [nameof(AccordionSearch)] = "Filter sections", [nameof(AccordionNoMatches)] = "No matching sections",
        [nameof(AccordionCopyTitle)] = "Copy title", [nameof(AccordionCopied)] = "Copied",
        [nameof(TabsMore)] = "More", [nameof(TabsMoreSelected)] = "More: {label}",
        [nameof(TabsScrollPrevious)] = "Previous tabs", [nameof(TabsScrollNext)] = "Next tabs",
        [nameof(TabsSection)] = "Section", [nameof(TabsPosition)] = "{current} of {total}",
        [nameof(TabsPause)] = "Pause", [nameof(TabsPlay)] = "Play",
        [nameof(TabsMotionDisabled)] = "Automatic tabs are disabled by reduced motion",
        [nameof(StepperStepOf)] = "Step {current} of {total}", [nameof(StepperBack)] = "Back",
        [nameof(StepperNext)] = "Next", [nameof(StepperFinish)] = "Finish",
        [nameof(StepperSkip)] = "Skip", [nameof(StepperSaveDraft)] = "Save draft",
        [nameof(StepperAllSteps)] = "All steps", [nameof(StepperOptional)] = "Optional",
        [nameof(StepperCompleted)] = "Completed", [nameof(StepperSkipped)] = "Skipped",
        [nameof(StepperIssues)] = "{count} issues to fix", [nameof(StepperIssue)] = "1 issue to fix",
        [nameof(DialogClose)] = "Close", [nameof(DrawerClose)] = "Close",
        [nameof(DrawerPrevious)] = "Previous record", [nameof(DrawerNext)] = "Next record",
        [nameof(StateLoading)] = "Loading…", [nameof(StateRetry)] = "Retry",
        [nameof(StateDetails)] = "Details"
        }) defaults.Add(entry.Key, entry.Value);
    }
}
