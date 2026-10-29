  // OfficeIMO owns document construction and capture-to-document mapping. This part only connects delivery contracts.
  const officeWrite = global.OfficeIMO.exportCanopy;
  EXPORT_IMPL.office = (capture, context) => {
    return officeWrite(capture, context.format, {
      signal: context.signal, about: context.includeMetadata, onProgress: progress => context.progress(progress.rows),
      // A paged PDF preserves captured values and links; native workbook rules have no PDF equivalent. Accept only that
      // known limitation explicitly, report it to the caller, and keep genuinely unsupported presentation as an error.
      // The published writer fits screen widths onto the page. Wrap rather than lose text after that fit, until its
      // canonical default sizing fix is published. Workbook widths and wrapping remain the captured presentation.
      ...(context.format === "pdf" ? { unsupportedPresentation: "text",
        columnOptions: Object.fromEntries(capture.request.columns.map(column => [column.id, { wrapText: true }])) } : {}),
      onDiagnostic: value => {
        if (context.format === "pdf" && !value.code.startsWith("PDF_NATIVE_RULE_NOT_RENDERED:"))
          throw new Error("CanopyX: unsupported PDF presentation: " + value.code);
        context.diagnostic(value);
      }
    });
  };
