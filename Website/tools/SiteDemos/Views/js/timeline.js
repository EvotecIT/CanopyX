import { createCalendar } from "@evotecit/canopyx/grid";
import "@evotecit/canopyx/grid.css";

createCalendar(document.getElementById("timeline"), {
  id: "host-events", label: "Incidents by host",
  timeline: true, view: "timeline", date: "2026-10-16", calendar: { zoom: "hour" },
  resources: [
    { id: "site-warsaw", label: "Warsaw" },
    { id: "waw-web-01", label: "waw-web-01", parent: "site-warsaw" },
    { id: "waw-db-01", label: "waw-db-01", parent: "site-warsaw" },
    { id: "site-berlin", label: "Berlin" },
    { id: "ber-web-01", label: "ber-web-01", parent: "site-berlin" },
    { id: "ber-db-01", label: "ber-db-01", parent: "site-berlin" }
  ],
  events: [
    { title: "Patch window", start: "2026-10-16T06:00:00Z", end: "2026-10-16T09:00:00Z", resource: "waw-web-01", tone: "info" },
    { title: "Replication lag", start: "2026-10-16T09:00:00Z", end: "2026-10-16T11:00:00Z", resource: "waw-db-01", tone: "warning" },
    { title: "Power feed lost", start: "2026-10-16T11:00:00Z", end: "2026-10-16T12:00:00Z", resource: "ber-web-01", tone: "danger" },
    { title: "Index rebuild", start: "2026-10-16T14:00:00Z", end: "2026-10-16T18:00:00Z", resource: "ber-db-01", tone: "info" },
    { title: "Disk alerts", start: "2026-10-16T16:00:00Z", end: "2026-10-16T18:00:00Z", resource: "waw-db-01", tone: "warning" }
  ]
});
