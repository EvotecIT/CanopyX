namespace CanopyX;

// Texts supplied by the optional standalone UI parts, independently of the grid and tree runtimes.
public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the accessible name and default placeholder of the accordion filter box. Default "Filter sections".</summary>
    public string AccordionSearch { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the message shown when no accordion section matches the filter. Default "No matching sections".</summary>
    public string AccordionNoMatches { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the button that copies a section title. Default "Copy title".</summary>
    public string AccordionCopyTitle { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the copy button after a section title was copied. Default "Copied".</summary>
    public string AccordionCopied { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the role a screen reader announces for a carousel. Default "carousel".</summary>
    public string CarouselRole { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the role a screen reader announces for a carousel slide. Default "slide".</summary>
    public string CarouselSlideRole { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the name of a slide and of its picker button, with <c>{current}</c> and <c>{total}</c>. Default "Slide {current} of {total}".</summary>
    public string CarouselSlide { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the carousel's previous button. Default "Previous slide".</summary>
    public string CarouselPrevious { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the carousel's next button. Default "Next slide".</summary>
    public string CarouselNext { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the group of slide buttons. Default "Choose a slide".</summary>
    public string CarouselPicker { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the play button's name while reduced motion keeps slides still. Default "Automatic slides are disabled by reduced motion".</summary>
    public string CarouselMotionDisabled { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a rating as words, with <c>{value}</c> and <c>{max}</c>. Default "{value} of {max}".</summary>
    public string RatingValue { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the area a signature is drawn on. Default "Signature pad".</summary>
    public string SignaturePad { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that removes the last stroke of a signature. Default "Undo".</summary>
    public string SignatureUndo { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that removes a signature. Default "Clear".</summary>
    public string SignatureClear { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that switches a signature to a typed name. Default "Type instead".</summary>
    public string SignatureType { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that switches a typed signature back to drawing. Default "Draw instead".</summary>
    public string SignatureDraw { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the label of the field a typed signature uses. Default "Type your full name".</summary>
    public string SignatureTyped { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the pen colour button. Default "Pen colour".</summary>
    public string SignatureColour { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that saves the signature as a PNG image. Default "Download PNG".</summary>
    public string SignatureDownloadPng { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that saves the signature as an SVG image. Default "Download SVG".</summary>
    public string SignatureDownloadSvg { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that lists tabs hidden by overflow. Default "More".</summary>
    public string TabsMore { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the overflow button text when the selected tab is hidden, including its <c>{label}</c>. Default "More: {label}".</summary>
    public string TabsMoreSelected { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the button that scrolls to previous tabs. Default "Previous tabs".</summary>
    public string TabsScrollPrevious { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the button that scrolls to next tabs. Default "Next tabs".</summary>
    public string TabsScrollNext { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the lead word of the collapsed tab picker. Default "Section".</summary>
    public string TabsSection { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the selected tab position, including <c>{current}</c> and <c>{total}</c>. Default "{current} of {total}".</summary>
    public string TabsPosition { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that pauses automatic tab advancement. Default "Pause".</summary>
    public string TabsPause { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that resumes automatic tab advancement. Default "Play".</summary>
    public string TabsPlay { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the explanation for the disabled Play control under reduced motion. Default "Automatic tabs are disabled by reduced motion".</summary>
    public string TabsMotionDisabled { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the step position, including <c>{current}</c> and <c>{total}</c>. Default "Step {current} of {total}".</summary>
    public string StepperStepOf { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that returns to the previous step. Default "Back".</summary>
    public string StepperBack { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that advances to the next step. Default "Next".</summary>
    public string StepperNext { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that finishes the last step. Default "Finish".</summary>
    public string StepperFinish { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that skips an optional step. Default "Skip".</summary>
    public string StepperSkip { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that asks the host to save a draft. Default "Save draft".</summary>
    public string StepperSaveDraft { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the label of the picker that lists every step. Default "All steps".</summary>
    public string StepperAllSteps { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the description of an optional step. Default "Optional".</summary>
    public string StepperOptional { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the description of a completed step. Default "Completed".</summary>
    public string StepperCompleted { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the description of a skipped step. Default "Skipped".</summary>
    public string StepperSkipped { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the description of multiple validation issues, including <c>{count}</c>. Default "{count} issues to fix".</summary>
    public string StepperIssues { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the description of one validation issue. Default "1 issue to fix".</summary>
    public string StepperIssue { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the dialog close button. Default "Close".</summary>
    public string DialogClose { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the drawer close button. Default "Close".</summary>
    public string DrawerClose { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the drawer button that shows the previous record. Default "Previous record".</summary>
    public string DrawerPrevious { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the drawer button that shows the next record. Default "Next record".</summary>
    public string DrawerNext { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the loading state message for deferred content. Default "Loading…".</summary>
    public string StateLoading { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that retries loading failed content. Default "Retry".</summary>
    public string StateRetry { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the disclosure label for state details. Default "Details".</summary>
    public string StateDetails { get => Get(); set => Set(value); }
}
