import { createCalendar } from "@evotecit/canopyx/grid";
import "@evotecit/canopyx/grid.css";

createCalendar(document.getElementById("calendar"), {
  id: "operations", label: "Operations calendar",
  preset: "standard", date: "2026-10-16", firstDay: 1,
  events: [
    { title: "Core switch firmware upgrade", start: "2026-10-14T22:00:00Z", end: "2026-10-15T03:00:00Z", tone: "info" },
    { title: "Database failover test", start: "2026-10-16T09:00:00Z", end: "2026-10-16T11:00:00Z", description: "DBA team, db-02" },
    { title: "Disk latency on fs-01", start: "2026-10-16T10:15:00Z", end: "2026-10-16T12:00:00Z", tone: "danger" },
    { title: "Certificate expires: portal.example.com", start: "2026-10-21T13:45:00Z", tone: "warning" },
    { title: "Data centre power test", start: "2026-10-24T06:00:00Z", end: "2026-10-24T18:00:00Z" },
    { title: "Weekly maintenance window", start: "2026-10-06T20:00:00Z", end: "2026-10-06T23:00:00Z",
      recurrence: "FREQ=WEEKLY;BYDAY=TU" },
    { title: "Change freeze", start: "2026-10-26", end: "2026-10-31" }
  ]
});
