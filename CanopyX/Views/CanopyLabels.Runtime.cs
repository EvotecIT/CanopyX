using CanopyX.Json;

namespace CanopyX;

// The labels the browser reads from the view document, and the members that test and write them.
public sealed partial class CanopyLabels {
    /// <summary>The labels the browser runtime reads from the view document, in document order.</summary>
    private static readonly string[] RuntimeNames = {
        nameof(GridDownloadXlsx), nameof(GridDownloadPdf),
        nameof(GridExportWorkbookHint), nameof(GridExportPdfHint), nameof(GridExportCsvHint), nameof(GridExportCopy),
        nameof(GridRegexSearch),
        nameof(PathEmpty), nameof(PathSource), nameof(PathTarget), nameof(PathStep), nameof(PathCycle), nameof(PathForeign), nameof(PathDisabled), nameof(PathKeys), nameof(PathPartial), nameof(StackWinner), nameof(StackEnforced), nameof(StackFiltered), nameof(StackEmpty), nameof(StackOrder), nameof(StackTruncated),
        nameof(BoardLane), nameof(BoardUnassigned), nameof(BoardEmpty), nameof(BoardWip), nameof(BoardWipFull), nameof(BoardMove), nameof(BoardMoved), nameof(BoardRejected), nameof(BoardPending), nameof(BoardPartial), nameof(BoardKeys),
        nameof(PlanMilestone), nameof(PlanCritical), nameof(PlanBaseline), nameof(PlanDependency), nameof(PlanDependencyConflict), nameof(PlanOverlapConflict), nameof(PlanIncomplete), nameof(PlanInvalidRange), nameof(PlanInvalidResource), nameof(PlanProposal), nameof(PlanMoveHint), nameof(PlanActual), nameof(PlanPending), nameof(PlanBaselineLabel), nameof(PlanDependencies), nameof(PlanConflict),
        nameof(GridEditCell), nameof(GridEditSave), nameof(GridEditCancel), nameof(GridEditDiscard), nameof(GridEditUndo), nameof(GridEditRedo),
        nameof(GridEditEdited), nameof(GridEditChanges), nameof(GridEditErrors), nameof(GridEditSaving), nameof(GridEditSaved), nameof(GridEditFailed),
        nameof(GridEditRequired), nameof(GridEditNumber), nameof(GridEditDate), nameof(GridEditMin), nameof(GridEditMax), nameof(GridEditStep),
        nameof(GridEditMinLength), nameof(GridEditMaxLength), nameof(GridEditPattern), nameof(GridEditChoice), nameof(GridEditConflict),
        nameof(GridEditRejected), nameof(GridEditNotSaved), nameof(GridEditNoMatches), nameof(GridEditSearching), nameof(GridEditUndone),
        nameof(GridEditRedone), nameof(GridEditNone),
        nameof(GridLiveOrderChanged), nameof(GridLiveResort), nameof(GridLiveNewData), nameof(GridLiveRefresh), nameof(GridLiveOrderHint),
        nameof(GridLiveChanged), nameof(GridLiveSorted), nameof(GridLiveRecordRemoved),
        nameof(GridFacetPanel), nameof(GridFacetPanelHide), nameof(GridFacetPanelShow), nameof(GridFacetShowMore), nameof(GridFacetShowFewer), nameof(GridFacetEmptyValue), nameof(GridFacetFrom), nameof(GridFacetTo), nameof(GridFacetHistogram), nameof(GridFacetBin), nameof(GridFacetNoChart), nameof(GridFacetClear), nameof(GridFacetCustom), nameof(GridFacetResult), nameof(GridFacetSelected), nameof(GridFacetValueCount), nameof(GridFacetCollapse), nameof(GridFacetExpand), nameof(GridFacetInvalid), nameof(GridFacetReversed),
        nameof(MatchesHighlight), nameof(MatchesCount), nameof(MatchesPosition), nameof(MatchesNone), nameof(MatchesLoaded), nameof(MatchesPrevious), nameof(MatchesNext), nameof(MatchesAnnounce), nameof(LayoutMenu), nameof(LayoutFit), nameof(LayoutScroll), nameof(LayoutCards), nameof(LayoutDensity), nameof(LayoutCompact), nameof(LayoutNormal), nameof(LayoutComfortable), nameof(LayoutChanged), nameof(LayoutSort),
        nameof(GridGroupCount),
        nameof(GridOfThese),
        nameof(GridOfTheseAreTrue),
        nameof(GridShowRowsWhere),
        nameof(GridDeleteCondition),
        nameof(GridConditionUpperValue),
        nameof(GridConditionValue),
        nameof(GridSelectionAggregate),
        nameof(GridClearColumnFilter),
        nameof(GridComplexFilter),
        nameof(GridWhere),
        nameof(GridUnpin),
        nameof(GridFitContent),
        nameof(GridMore), nameof(GridDone), nameof(GridClearAll), nameof(GridRows), nameof(GridResultNoun), nameof(GridSearchNoun), nameof(GridChart), nameof(GridColumnMenu), nameof(GridSortAscending), nameof(GridSortDescending), nameof(GridClearSort), nameof(GridFilterColumn), nameof(GridHideColumn), nameof(GridGroupedBy), nameof(GridRemoveGrouping), nameof(GridSelectAllValues), nameof(GridFilterValues), nameof(GridAddCondition), nameof(GridAddGroup), nameof(GridAnd), nameof(GridOr), nameof(GridEditAsText), nameof(GridFilterText), nameof(GridDeepFilters), nameof(GridToday), nameof(GridYesterday), nameof(GridLastSevenDays), nameof(GridLastThirtyDays), nameof(GridThisMonth), nameof(GridDateRange), nameof(GridEmpty), nameof(GridEmptyReason), nameof(GridNoMatches), nameof(GridNoMatchesReason), nameof(GridRetry), nameof(GridLoadFailed), nameof(GridAll), nameof(GridPageOf), nameof(GridStatusCount), nameof(GridDetailsSection), nameof(GridPreviousRecord), nameof(GridNextRecord), nameof(GridShowMore), nameof(GridNoData), nameof(GridPeriodRange), nameof(GridHealthy),
        nameof(GridBetween), nameof(GridRangeEnd), nameof(GridInvalidRange), nameof(GridSuggestedCategory), nameof(GridChooseCategory),
        nameof(GridBooleanValue), nameof(GridTrue), nameof(GridFalse), nameof(GridHeaderFilter), nameof(GridExpandCell), nameof(GridCloseCell), nameof(GridCloseRecord),
        nameof(GridMoveColumn), nameof(GridResizeHelp), nameof(GridColumnMoved), nameof(GridFitColumn), nameof(GridFitAllColumns),
        nameof(GridPinColumn), nameof(GridPinNone), nameof(GridPinLeft), nameof(GridPinRight), nameof(GridResponsiveHidden), nameof(GridFindColumn), nameof(GridShowAllColumns), nameof(GridResetColumns), nameof(GridReorderColumn), nameof(GridPinnedLeft), nameof(GridPinnedRight),
        nameof(GridFilterGroupTitle), nameof(GridFilterMatch), nameof(GridFilterAll), nameof(GridFilterAny), nameof(GridAddFilterGroup), nameof(GridDeleteFilterGroup),
        nameof(GridFacetValues), nameof(GridFacetSearch), nameof(GridFacetIncludeCurrent), nameof(GridFacetLoad), nameof(GridFacetChoose), nameof(GridFacetCounts), nameof(GridFacetReload),
        nameof(GridRenameView), nameof(GridDefaultView), nameof(GridClearDefaultView), nameof(GridDefaultViewName), nameof(GridNoDefaultView), nameof(GridDefaultViewOption),
        nameof(GridSelection), nameof(GridSelectPage), nameof(GridSelectMatching), nameof(GridClearSelection), nameof(GridSelectionCount),
        nameof(GridSelectionQueryCount), nameof(GridSelectionQueryUnknown), nameof(GridSelectRecord),
        nameof(GridGroupHeading), nameof(GridGroupMissing), nameof(GridGroupExpand), nameof(GridGroupCollapse), nameof(GridSummary), nameof(GridGroupOrder),
        nameof(GridAggregateCount), nameof(GridAggregateSum), nameof(GridAggregateAverage), nameof(GridAggregateMinimum), nameof(GridAggregateMaximum),
        nameof(GridGroupBy), nameof(GridUngroup), nameof(GridGroupDrop), nameof(GridExpandAll), nameof(GridCollapseAll), nameof(GridExpandLevel), nameof(GridCollapseLevel), nameof(GridGroupMove), nameof(GridGroupSortBy), nameof(GridGroupSortValue), nameof(GridGroupSortAggregate), nameof(GridSelectGroup), nameof(GridAggregateDistinct), nameof(GridShowDetail), nameof(GridHideDetail), nameof(GridDetailOf), nameof(GridDetailFailed),
        nameof(RecordBack), nameof(RecordBackTo), nameof(RecordTrail), nameof(RecordShowing), nameof(RecordTabs), nameof(RecordSections), nameof(RecordOtherFields), nameof(RecordShowEmpty), nameof(RecordHideEmpty), nameof(RecordActions), nameof(RecordCopyValues), nameof(RecordCopyJson), nameof(RecordCopyLink), nameof(RecordCopied), nameof(RecordPrint), nameof(RecordExportCsv), nameof(RecordExportJson), nameof(RecordOpenAll), nameof(RecordLoadMore), nameof(RecordCount), nameof(RecordItems), nameof(RecordMore), nameof(RecordShowAll), nameof(RecordRetry), nameof(RecordLoadFailed), nameof(RecordUnavailable), nameof(RecordField), nameof(RecordValue), nameof(RecordSection), nameof(RecordBefore), nameof(RecordAfter), nameof(RecordAdded), nameof(RecordRemoved), nameof(RecordChanged),
        nameof(GridExportProgress), nameof(GridExportReading), nameof(GridExportCancelled), nameof(GridCancelExport), nameof(GridNoExportColumns), nameof(GridPrint),
        nameof(GridResultCount), nameof(GridClearQuery), nameof(GridRemoveSearch), nameof(GridGroupedFilters), nameof(GridRemoveGroup), nameof(GridRemoveCondition),
        nameof(GridUnknownCount), nameof(GridMatchedCount), nameof(GridCursorRange),
        nameof(GridPaging), nameof(GridPageRange), nameof(GridPageNumber), nameof(GridPageLength), nameof(GridFirstPage), nameof(GridPreviousPage), nameof(GridNextPage), nameof(GridLastPage),
        nameof(GridPageInfo), nameof(GridPageInfoFiltered), nameof(GridPageButton),
        nameof(GridExport), nameof(GridFilteredResults), nameof(GridSelectedRows), nameof(GridAllResults), nameof(GridVisibleRows), nameof(GridAllRows), nameof(GridDownloadCsv), nameof(GridCopy), nameof(GridDetails),
        nameof(GridCellRangeSelected), nameof(GridCellRangesSelected), nameof(GridCellRangeCleared), nameof(GridCopyCells), nameof(GridCopyCellsWithHeaders), nameof(GridPasteCells), nameof(GridSelectAllCells), nameof(GridCellsCopied), nameof(GridCellsPasted), nameof(GridPasteRefused), nameof(GridPasteReadOnly), nameof(GridPasteType), nameof(GridPasteReport), nameof(GridPasteCell), nameof(GridFillHandle), nameof(GridCellsFilled), nameof(GridCellMenu), nameof(GridClearCellRanges), nameof(GridRowPicked),
        nameof(SearchPlaceholder), nameof(SearchResults), nameof(SearchResultCount), nameof(SearchResultCountOfTotal), nameof(SearchResultCountOfMany),
        nameof(GridFilters), nameof(GridColumn), nameof(GridOperator), nameof(GridValue), nameof(GridValueType), nameof(GridText), nameof(GridBoolean), nameof(GridAddFilter), nameof(GridRemoveFilter), nameof(GridApply), nameof(GridClearFilters), nameof(GridMoveEarlier), nameof(GridMoveLater), nameof(GridViews), nameof(GridViewName), nameof(GridSaveView), nameof(GridRemoveView), nameof(GridResetView), nameof(GridChooseView), nameof(GridInvalidFilter), nameof(GridContains), nameof(GridStartsWith), nameof(GridIn), nameof(GridIsNull), nameof(GridIsNotNull),
        nameof(SearchNoResults), nameof(SearchTooShort), nameof(SearchWordTooShort), nameof(SearchFailed), nameof(Columns), nameof(HiddenColumns), nameof(VisibleColumns),
        nameof(ResizeColumn), nameof(ColumnWidth), nameof(Loading), nameof(LoadError), nameof(QueryFailed), nameof(ShowMore), nameof(ShowMoreUnknownTotal),
        nameof(PageLoaded), nameof(ItemsLoaded), nameof(Yes), nameof(No), nameof(UtcTime), nameof(LocalTime), nameof(MountError),
        nameof(Actions), nameof(EditValue), nameof(SaveEdit), nameof(CancelEdit), nameof(InvalidEdit), nameof(InteractionPending),
        nameof(InteractionRejected), nameof(InteractionFailed), nameof(MarkMove), nameof(MoveHere), nameof(MoveBefore), nameof(MoveAfter), nameof(CancelMove),
        nameof(FormatRules), nameof(FormatLegend), nameof(FormatUpTo), nameof(FormatAbove), nameof(FormatHiddenFlagged), nameof(FormatRule), nameof(FormatAddRule), nameof(FormatEditRule), nameof(FormatDeleteRule), nameof(FormatMoveUp), nameof(FormatMoveDown), nameof(FormatEnableRule), nameof(FormatNoRules), nameof(FormatName), nameof(FormatDescription), nameof(FormatOnlyRowsWhere), nameof(FormatEveryRow), nameof(FormatNone), nameof(FormatApplyTo), nameof(FormatTargetCell), nameof(FormatTargetRow), nameof(FormatTargetColumns), nameof(FormatStyle), nameof(FormatHighlight), nameof(FormatDataBar), nameof(FormatColorScale), nameof(FormatBands), nameof(FormatTone), nameof(FormatEmphasis), nameof(FormatFill), nameof(FormatTextOnly), nameof(FormatStrong), nameof(FormatIcon), nameof(FormatNoIcon), nameof(FormatAutomatic), nameof(FormatBadge), nameof(FormatCue), nameof(FormatLowest), nameof(FormatMidpoint), nameof(FormatHighest), nameof(FormatAddBand), nameof(FormatRemoveBand), nameof(FormatSave), nameof(FormatCancel), nameof(FormatShowLegend), nameof(FormatInvalid), nameof(FormatMatchCase), nameof(FormatToneDanger), nameof(FormatToneWarning), nameof(FormatToneSuccess), nameof(FormatToneInfo), nameof(FormatToneNeutral), nameof(FormatToneMuted), nameof(FormatNotContains), nameof(FormatEndsWith), nameof(FormatNotIn), nameof(FormatBetween), nameof(FormatLike), nameof(FormatMatches), nameof(FormatOlderThan), nameof(FormatWithinLast), nameof(FormatNotLike), nameof(FormatNotMatches), nameof(FormatBetweenExclusive),
        nameof(LinkFilteredBy), nameof(LinkRemoveFilter), nameof(LinkFiltered), nameof(LinkHighlighted), nameof(LinkHighlightedRows), nameof(LinkCleared),
        nameof(CalendarToday), nameof(CalendarPrevious), nameof(CalendarNext), nameof(CalendarViews), nameof(CalendarMonth), nameof(CalendarWeek), nameof(CalendarDay), nameof(CalendarDays), nameof(CalendarAgenda), nameof(CalendarYear), nameof(CalendarTimeline), nameof(CalendarGoTo), nameof(CalendarAllDay), nameof(CalendarMore), nameof(CalendarMoreLabel), nameof(CalendarDayEvents), nameof(CalendarNoEvents), nameof(CalendarEvents), nameof(CalendarShowing), nameof(CalendarRepeats), nameof(CalendarTruncated), nameof(CalendarLoading), nameof(CalendarLoadError), nameof(CalendarNow), nameof(CalendarZoom),
        nameof(CalendarZoomHour), nameof(CalendarZoomDay), nameof(CalendarZoomWeek), nameof(CalendarZoomMonth), nameof(CalendarZoomQuarter), nameof(CalendarResources), nameof(CalendarCapacity), nameof(CalendarCapacityAt), nameof(CalendarBusy), nameof(CalendarOverlaps), nameof(CalendarUnavailable), nameof(CalendarOutsideHours), nameof(CalendarConflict), nameof(CalendarNotAllowed), nameof(CalendarMoved), nameof(CalendarResized), nameof(CalendarSeriesMoved), nameof(CalendarSeriesTime), nameof(CalendarMoveHelp), nameof(CalendarEdit), nameof(CalendarSaveFailed), nameof(CalendarExport), nameof(CalendarTimeRange), nameof(CalendarSelected), nameof(CalendarLane), nameof(CalendarHighlighted),
        nameof(CalendarMini), nameof(CalendarWeekList), nameof(CalendarDayList), nameof(CalendarMonths), nameof(CalendarWeekNumber), nameof(CalendarWeekShort), nameof(CalendarNewEvent), nameof(CalendarEventTitle), nameof(CalendarCreate), nameof(CalendarCancel), nameof(CalendarCreated), nameof(CalendarReceived), nameof(CalendarOccurrenceReadOnly), nameof(CalendarOccurrenceTitle), nameof(CalendarEditOccurrence), nameof(CalendarRemoveOccurrence), nameof(CalendarOccurrenceScope), nameof(CalendarSharedResources), nameof(CalendarResourceWindow), nameof(CalendarThisEvent), nameof(CalendarThisAndFollowing), nameof(CalendarAllEvents), nameof(CalendarSources), nameof(CalendarImportFailed), nameof(CalendarActions), nameof(CalendarOpen), nameof(CalendarMove), nameof(CalendarNewHere), nameof(CalendarOutsideRange), nameof(CalendarClose), nameof(CalendarDetailsOf)
    };

    private static readonly string[] InteractionNames = {
        nameof(Actions), nameof(EditValue), nameof(SaveEdit), nameof(CancelEdit), nameof(InvalidEdit), nameof(InteractionPending),
        nameof(InteractionRejected), nameof(InteractionFailed), nameof(MarkMove), nameof(MoveHere), nameof(MoveBefore), nameof(MoveAfter), nameof(CancelMove),
        nameof(FormatRules), nameof(FormatLegend), nameof(FormatUpTo), nameof(FormatAbove), nameof(FormatHiddenFlagged), nameof(FormatRule), nameof(FormatAddRule), nameof(FormatEditRule), nameof(FormatDeleteRule), nameof(FormatMoveUp), nameof(FormatMoveDown), nameof(FormatEnableRule), nameof(FormatNoRules), nameof(FormatName), nameof(FormatDescription), nameof(FormatOnlyRowsWhere), nameof(FormatEveryRow), nameof(FormatNone), nameof(FormatApplyTo), nameof(FormatTargetCell), nameof(FormatTargetRow), nameof(FormatTargetColumns), nameof(FormatStyle), nameof(FormatHighlight), nameof(FormatDataBar), nameof(FormatColorScale), nameof(FormatBands), nameof(FormatTone), nameof(FormatEmphasis), nameof(FormatFill), nameof(FormatTextOnly), nameof(FormatStrong), nameof(FormatIcon), nameof(FormatNoIcon), nameof(FormatAutomatic), nameof(FormatBadge), nameof(FormatCue), nameof(FormatLowest), nameof(FormatMidpoint), nameof(FormatHighest), nameof(FormatAddBand), nameof(FormatRemoveBand), nameof(FormatSave), nameof(FormatCancel), nameof(FormatShowLegend), nameof(FormatInvalid), nameof(FormatMatchCase), nameof(FormatToneDanger), nameof(FormatToneWarning), nameof(FormatToneSuccess), nameof(FormatToneInfo), nameof(FormatToneNeutral), nameof(FormatToneMuted), nameof(FormatNotContains), nameof(FormatEndsWith), nameof(FormatNotIn), nameof(FormatBetween), nameof(FormatLike), nameof(FormatMatches), nameof(FormatOlderThan), nameof(FormatWithinLast), nameof(FormatNotLike), nameof(FormatNotMatches), nameof(FormatBetweenExclusive)
    };

    /// <summary>Gets whether translations use labels supplied by the interactive browser entry point.</summary>
    public bool RequiresInteractiveRuntime {
        get {
            foreach (var name in InteractionNames) if (_values.ContainsKey(name)) return true;
            return false;
        }
    }

    /// <summary>Whether any label the browser reads differs from English, so the view document carries it.</summary>
    /// <param name="tree">Count only the labels the tree runtimes read (a tree view's document).</param>
    internal bool HasRuntimeLabels(bool tree) {
        foreach (var name in RuntimeNames) {
            if (_values.ContainsKey(name) && (!tree || ReadByTrees(name))) {
                return true;
            }
        }

        return false;
    }

    /// <summary>Writes the view document's <c>labels</c>: the labels the browser reads that differ from English.</summary>
    /// <param name="writer">The view document's writer.</param>
    /// <param name="tree">Write only the labels the tree runtimes read (a tree view's document).</param>
    internal void WriteJson(CanopyJsonWriter writer, bool tree) {
        writer.BeginObject();
        foreach (var name in RuntimeNames) {
            if ((!tree || ReadByTrees(name)) && _values.TryGetValue(name, out var value)) {
                writer.Property(char.ToLowerInvariant(name[0]) + name.Substring(1), value);
            }
        }

        writer.EndObject();
    }
}
