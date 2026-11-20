using System;
using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyLabels {
    private static void AddUiDefaults(Dictionary<string, string> defaults) {
        foreach (var entry in new Dictionary<string, string>(StringComparer.Ordinal) {
        [nameof(AccordionSearch)] = "Filter sections", [nameof(AccordionNoMatches)] = "No matching sections",
        [nameof(AccordionCopyTitle)] = "Copy title", [nameof(AccordionCopied)] = "Copied",
        [nameof(ToastRegion)] = "Notifications", [nameof(ToastClose)] = "Dismiss",
        [nameof(ToastQueued)] = "{count} more", [nameof(ToastInfo)] = "Information",
        [nameof(ToastSuccess)] = "Success", [nameof(ToastWarning)] = "Warning",
        [nameof(ToastDanger)] = "Error", [nameof(ToastNeutral)] = "Notice",
        [nameof(LightboxTitle)] = "Gallery", [nameof(LightboxPrevious)] = "Previous",
        [nameof(LightboxNext)] = "Next", [nameof(LightboxZoomIn)] = "Zoom in",
        [nameof(LightboxZoomOut)] = "Zoom out", [nameof(LightboxZoomReset)] = "Fit to screen",
        [nameof(LightboxError)] = "This item could not be loaded",
        [nameof(CarouselRole)] = "carousel", [nameof(CarouselSlideRole)] = "slide",
        [nameof(CarouselSlide)] = "Slide {current} of {total}", [nameof(CarouselPrevious)] = "Previous slide",
        [nameof(CarouselNext)] = "Next slide", [nameof(CarouselPicker)] = "Choose a slide",
        [nameof(CarouselMotionDisabled)] = "Automatic slides are disabled by reduced motion", [nameof(RatingValue)] = "{value} of {max}",
        [nameof(SignaturePad)] = "Signature pad", [nameof(SignatureUndo)] = "Undo",
        [nameof(SignatureClear)] = "Clear", [nameof(SignatureType)] = "Type instead",
        [nameof(SignatureDraw)] = "Draw instead", [nameof(SignatureTyped)] = "Type your full name",
        [nameof(SignatureColour)] = "Pen colour", [nameof(SignatureDownloadPng)] = "Download PNG",
        [nameof(SignatureDownloadSvg)] = "Download SVG",
        [nameof(SelectNoMatches)] = "No matches", [nameof(SelectResults)] = "Results: {count}",
        [nameof(SelectCreate)] = "Add “{text}”", [nameof(SelectRemove)] = "Remove {label}",
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
