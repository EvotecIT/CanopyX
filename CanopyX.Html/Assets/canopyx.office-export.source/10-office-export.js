  // OfficeIMO owns document construction and capture-to-document mapping. This part only connects delivery contracts.
  const officeWrite = global.OfficeIMO.exportCanopy;
  EXPORT_IMPL.office = (capture, context) => officeWrite(capture, context.format, {
    signal: context.signal, about: context.includeMetadata, onProgress: progress => context.progress(progress.rows),
    // A paged PDF preserves captured values and links; native workbook rules have no PDF equivalent. Accept only that
    // known limitation explicitly, report it to the caller, and keep genuinely unsupported presentation as an error.
    ...(context.format === "pdf" ? { unsupportedPresentation: "text" } : {}),
    onDiagnostic: value => {
      if (context.format === "pdf" && !value.code.startsWith("PDF_NATIVE_RULE_NOT_RENDERED:"))
        throw new Error("CanopyX: unsupported PDF presentation: " + value.code);
      context.diagnostic(value);
    }
  });
