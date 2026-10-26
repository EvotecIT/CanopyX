import { createDataGrid } from "@evotecit/canopyx/reporting";
import "@evotecit/canopyx/reporting.css";

const devices = [
  ["WS-WAW-0001", "Warsaw", "Windows 11 24H2", 96, true],
  ["WS-WAW-0002", "Warsaw", "Windows 10 22H2", 61, false],
  ["SRV-WAW-0003", "Warsaw", "Windows Server 2025", 88, true],
  ["WS-LON-0004", "London", "Windows 11 24H2", 100, true],
  ["WS-LON-0005", "London", "Windows 11 23H2", 74, true],
  ["SRV-BER-0006", "Berlin", "Windows Server 2022", 58, true]
];

createDataGrid(document.getElementById("inventory"), {
  view: {
    protocol: "canopyx/2", type: "grid", id: "devices", label: "Device inventory",
    pageSize: 100,
    selection: "multiple",
    statusBar: true,
    noun: "devices",
    columns: [
      {
        id: "device", title: "Device", kind: "text", sortable: true,
        presenter: { kind: "identifier", mono: true }
      },
      { id: "site", title: "Site", kind: "text", sortable: true },
      { id: "os", title: "Operating system", kind: "text", sortable: true },
      {
        id: "patch", title: "Patch level", kind: "number", sortable: true,
        presenter: { kind: "progress", maximum: 100 }
      },
      {
        id: "encrypted", title: "Encrypted", kind: "text", sortable: true,
        presenter: { kind: "boolean" }
      }
    ],
    source: { kind: "inline" },
    reporting: {
      grouping: { column: "site", direction: "asc" },
      facetColumns: ["site", "os"],
      aggregates: [{
        id: "patch-average", column: "patch", operation: "average",
        label: "Average patch level"
      }]
    },
    rows: devices.map(([device, site, os, patch, encrypted]) => ({
      id: device.toLowerCase(),
      cells: {
        device, site, os, encrypted,
        patch: {
          value: patch,
          text: `${patch}%`,
          tone: patch < 70 ? "danger" : undefined
        }
      }
    }))
  }
});
