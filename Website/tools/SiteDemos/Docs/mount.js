import { createTreeGrid } from "@evotecit/canopyx";
import "@evotecit/canopyx/styles.css";

const grid = createTreeGrid(document.getElementById("files"), {
  view: {
    protocol: "canopyx/2", type: "view", id: "files", label: "Project files",
    rowHeight: 28, pageSize: 100, selection: "single",
    search: { minLength: 1, maxResults: 50 },
    columns: [
      { id: "name", title: "Name", kind: "text", width: 300, sortable: true },
      { id: "owner", title: "Owner", kind: "text", width: 160 }
    ],
    source: { kind: "inline" },
    roots: [{
      id: "projects", label: "Projects", expanded: true,
      children: [
        { id: "plan", label: "Project plan.docx", cells: { owner: "anna.kowalska" } },
        { id: "report", label: "Quarterly report.pdf", cells: { owner: "chen.wei" },
          badges: [{ text: "new", tone: "info" }] }
      ]
    }]
  }
});

await grid.ready;
