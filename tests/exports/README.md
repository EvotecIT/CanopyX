# Independent Office artifact validation

The browser tests save real XLSX/PDF files beside their captured request and expected records. `Build.ps1` runs this
non-packable validation executable after the browser suite. Its OfficeIMO.Excel/Pdf packages are test tools; no shipped
CanopyX project references them.

Full validation opens XLSX through OfficeIMO's editable model and typed reader, runs OpenXML schema validation, compares
the captured cells and record order, and checks widths, frozen panes, number formats, outlines, aggregate formulas, native
conditional rules and hyperlinks. Group headings and totals must match the captured group descriptors and formula cells;
extra or duplicate data records cannot masquerade as structural rows. The fixture uses one aggregate per exported column.

The PDF reader checks repairs, repeated headings and page orientation, then identifies actual records using the fixture's
identity pattern and compares their order and cell text. The reported record count comes from the document. The fixture
uses distinct resource names so missing, duplicate, unexpected or reordered records are detectable.

For focused reader diagnostics, `--records-only` retains schema, content, scope and structural checks while leaving out the
writer's visual/style assertions. Its report labels that mode explicitly. The build never passes this switch; a successful
record diagnostic does not qualify styled Office delivery.
