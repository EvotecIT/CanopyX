import { createTreeGrid } from "@evotecit/canopyx";
import "@evotecit/canopyx/styles.css";

const file = (id, label, bytes, owner, modified, badges) =>
  ({ id, label, kind: "file", badges, cells: { size: { value: bytes, text: `${Math.round(bytes / 1024)} KB` }, owner, modified } });

const grid = createTreeGrid(document.getElementById("files"), {
  view: {
    protocol: "canopyx/2", type: "view", id: "files", label: "File shares",
    selection: "single", search: { minLength: 1, maxResults: 50 },
    columns: [
      { id: "name", title: "Name", kind: "text", width: 280, sortable: true },
      { id: "size", title: "Size", kind: "number", sortable: true },
      { id: "owner", title: "Owner", kind: "text", sortable: true },
      { id: "modified", title: "Modified", kind: "datetime", sortable: true }
    ],
    source: { kind: "inline" },
    roots: [
      { id: "finance", label: "\\\\fs01\\finance", kind: "folder", expanded: true, children: [
        file("budget", "Budget 2026.xlsx", 482304, "anna.kowalska", "2026-10-02T09:30:00Z"),
        file("invoices", "Invoices Q3.pdf", 2310144, "ben.okafor", "2026-10-07T09:30:00Z"),
        file("payroll", "Payroll export.csv", 96256, "chen.wei", "2026-10-14T09:30:00Z",
          [{ text: "Shared externally", tone: "warning" }])
      ] },
      { id: "people", label: "\\\\fs01\\people", kind: "folder", expanded: true, children: [
        file("handbook", "Staff handbook.docx", 1048576, "dana.levi", "2026-09-16T09:30:00Z"),
        file("rota", "On-call rota.xlsx", 40960, "erik.lund", "2026-10-15T09:30:00Z")
      ] }
    ]
  }
});

await grid.ready;
