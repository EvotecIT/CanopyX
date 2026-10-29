import { createMatrix } from "@evotecit/canopyx/grid";
import "@evotecit/canopyx/grid.css";

const server = (id, label, site) => ({ id, label, values: { site } });

createMatrix(document.getElementById("matrix"), {
  view: {
    protocol: "canopyx/2", type: "matrix", id: "services",
    label: "Services by server",
    states: [
      {
        id: "critical", label: "Critical", tone: "danger", symbol: "cross",
        attention: true
      },
      {
        id: "warning", label: "Warning", tone: "warning", symbol: "warning",
        attention: true
      },
      { id: "ok", label: "Running", tone: "success", symbol: "check" },
      { id: "absent", label: "Not installed", tone: "muted", symbol: "dash" }
    ],
    rows: {
      title: "Server",
      groupBy: "site",
      attributes: [{ id: "site", title: "Site", facet: true }],
      items: [
        server("srv-osl-01", "SRV-OSL-01", "Oslo"),
        server("srv-osl-02", "SRV-OSL-02", "Oslo"),
        server("srv-lyo-01", "SRV-LYO-01", "Lyon"),
        server("srv-lyo-02", "SRV-LYO-02", "Lyon")
      ]
    },
    columns: {
      title: "Service",
      items: [
        { id: "dns", label: "DNS" },
        { id: "ldap", label: "LDAP" },
        { id: "smb", label: "File sharing" },
        { id: "backup", label: "Backup agent" }
      ]
    },
    // One string per server, one digit per service: the position of its state.
    cells: ["2222", "2120", "2212", "3322"],
    notes: [[1, 3, null, null, "Probes failing: 3/3."]]
  }
});
