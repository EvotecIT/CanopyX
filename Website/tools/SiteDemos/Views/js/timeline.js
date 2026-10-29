import { createCalendar } from "@evotecit/canopyx/grid";
import "@evotecit/canopyx/grid.css";

const on16th = hour => `2026-10-16T${String(hour).padStart(2, "0")}:00:00Z`;
const event = (title, tone, resource, from, to) =>
  ({ title, tone, resource, start: on16th(from), end: on16th(to) });

createCalendar(document.getElementById("timeline"), {
  id: "host-events",
  label: "Incidents by host",
  timeline: true,
  view: "timeline",
  date: "2026-10-16",
  calendar: { zoom: "hour" },
  resources: [
    { id: "site-warsaw", label: "Warsaw" },
    { id: "waw-web-01", label: "waw-web-01", parent: "site-warsaw" },
    { id: "waw-db-01", label: "waw-db-01", parent: "site-warsaw" },
    { id: "site-berlin", label: "Berlin" },
    { id: "ber-web-01", label: "ber-web-01", parent: "site-berlin" },
    { id: "ber-db-01", label: "ber-db-01", parent: "site-berlin" }
  ],
  events: [
    event("Patch window", "info", "waw-web-01", 6, 9),
    event("Replication lag", "warning", "waw-db-01", 9, 11),
    event("Power feed lost", "danger", "ber-web-01", 11, 12),
    event("Index rebuild", "info", "ber-db-01", 14, 18),
    event("Disk alerts", "warning", "waw-db-01", 16, 18)
  ]
});
