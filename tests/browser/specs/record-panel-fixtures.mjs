// A generic certificate inventory for the record panel tests: eight grid columns, about fifty record-only fields in
// sections and tabs, structured values (names, contacts, policies), related records, a timeline and changes.
import { viewPage } from "./support.mjs";

export const api = "document.querySelector('[data-canopyx-host]').canopyx";
const issuers = ["Example Root CA", "Example Issuing CA 1", "Example Issuing CA 2"];
const statuses = [["Valid", "success"], ["Expiring", "warning"], ["Expired", "danger"]];

export function certificate(i, total) {
  const id = "c" + String(i).padStart(3, "0"), [status, tone] = statuses[i % 3], days = i % 3 === 2 ? -(i % 9) : 10 + i * 7 % 300;
  const name = "host" + (i % Math.max(1, Math.floor(total / 2))) + ".example.test";
  const expires = new Date(Date.UTC(2026, 9, 15) + days * 86400000).toISOString().replace(".000", "");
  const sans = Array.from({ length: 2 + i % 4 }, (_, n) => n ? "alt" + n + "." + name : name);
  const related = Array.from({ length: Math.min(total - 1, 3) }, (_, n) => (i + n + 1) % total).filter(n => n !== i)
    .map(n => ({ id: "c" + String(n).padStart(3, "0"), cells: { cn: "host" + (n % Math.max(1, Math.floor(total / 2))) + ".example.test", status: statuses[n % 3][0] } }));
  return {
    id,
    cells: {
      cn: { value: name, secondary: "Serial 0x" + (1000 + i).toString(16) },
      status: { value: status, tone },
      days: { value: days, tone: days < 0 ? "danger" : days < 30 ? "warning" : undefined },
      expires,
      issuer: issuers[i % issuers.length],
      owner: { value: "Team " + "ABCD"[i % 4], ref: { id: "c" + String((i + 1) % total).padStart(3, "0") } },
      names: { value: sans.join(", "), items: sans },
      type: i % 2 ? "Server" : "Client",
      serial: "0x" + (1000 + i).toString(16)
    },
    fields: {
      thumbprint: "A1B2C3D4E5F6" + String(i).padStart(4, "0"),
      keyAlgorithm: "RSA", keySize: i % 2 ? 2048 : 4096, signature: "sha256RSA", version: 3,
      notBefore: "2025-10-15T08:00:00Z", autoRenew: i % 2 === 0, renewalWindow: "",
      team: "Platform", costCenter: i % 5 ? "CC-" + (100 + i) : "",
      contacts: { records: { columns: [{ id: "role", title: "Role" }, { id: "name", title: "Name" }, { id: "email", title: "Email" }],
        rows: [{ id: "o", cells: { role: "Owner", name: "Alex Example", email: "alex@example.test" } },
          { id: "t", cells: { role: "Technical", name: "Sam Example", email: "sam@example.test" } },
          { id: "b", cells: { role: "Backup", name: "Kim Example", email: "kim@example.test" } }] } },
      policies: { fields: [{ name: "Profile", value: "Web server" }, { name: "Validation", value: { value: "Organisation", tone: "info" } },
        { name: "Key usage", value: { items: ["Digital signature", "Key encipherment"] } }] },
      keyUsage: { items: ["Digital signature", "Key encipherment"] },
      related: { records: { columns: [{ id: "cn", title: "Common name" }, { id: "status", title: "Status" }], rows: related, total: related.length,
        target: { view: "certificates", column: "cn", values: [name] } } },
      history: { events: [
        { time: "2026-10-01T09:30:00Z", kind: "Reminder", tone: "info", actor: "Scheduler", summary: "Reminder sent to the owner" },
        { time: "2026-09-12T14:05:00Z", kind: "Change", tone: "warning", actor: "Alex Example", summary: "Owner changed",
          changes: [{ name: "Owner", before: "Team Z", after: "Team " + "ABCD"[i % 4] }] },
        { time: "2026-09-12T08:00:00Z", kind: "Issued", tone: "success", summary: "Certificate issued" }] },
      changes: { changes: [{ name: "Recipients", before: { items: ["alex@example.test", "old@example.test"] }, after: { items: ["alex@example.test", "sam@example.test"] } },
        { name: "Status", before: "Valid", after: status }] },
      trend: { value: days, series: Array.from({ length: 12 }, (_, n) => ({ period: "2026-" + String(n + 1).padStart(2, "0"), value: days + 120 - n * 10 })) }
    }
  };
}

export function definition(extra = {}, count = 12) {
  return {
    protocol: "canopyx/2", type: "grid", id: "certificates", label: "Certificates", rowHeight: 34, pageSize: 100, selection: "none", search: true,
    columns: [
      { id: "cn", title: "Common name", kind: "text", sortable: true, presenter: { kind: "identifier" } },
      { id: "status", title: "Status", kind: "text", sortable: true, presenter: { kind: "state" } },
      { id: "days", title: "Days left", kind: "number", sortable: true },
      { id: "expires", title: "Expires", kind: "datetime", sortable: true },
      { id: "issuer", title: "Issuer", kind: "text", sortable: true },
      { id: "owner", title: "Owner", kind: "text", sortable: true },
      { id: "names", title: "Names", kind: "text", presenter: { kind: "structured", display: "chips", limit: 2 } },
      { id: "type", title: "Type", kind: "text", sortable: true },
      { id: "serial", title: "Serial", kind: "text", hidden: true, drawer: false }
    ],
    record: {
      fields: [
        { id: "thumbprint", title: "Thumbprint" }, { id: "keyAlgorithm", title: "Key algorithm" }, { id: "keySize", title: "Key size", kind: "number" },
        { id: "signature", title: "Signature algorithm" }, { id: "version", title: "Version", kind: "number" }, { id: "notBefore", title: "Valid from", kind: "datetime" },
        { id: "autoRenew", title: "Automatic renewal" }, { id: "renewalWindow", title: "Renewal window" }, { id: "team", title: "Team" },
        { id: "costCenter", title: "Cost center" }, { id: "contacts", title: "Contacts" }, { id: "policies", title: "Policies" }, { id: "keyUsage", title: "Key usage" },
        { id: "related", title: "Certificates with the same name" }, { id: "history", title: "Timeline" }, { id: "changes", title: "Latest changes" },
        { id: "trend", title: "Days left over time", kind: "number", presenter: { kind: "sparklineLine" } }
      ],
      header: { status: "status", facts: ["days", "expires", "issuer"] },
      sections: [
        { id: "validity", label: "Validity", fields: ["expires", "days", "notBefore", "autoRenew", "renewalWindow"] },
        { id: "ownership", label: "Ownership", fields: ["owner", "team", "costCenter", "contacts"] },
        { id: "names", label: "Names", fields: ["names", "keyUsage"] },
        { id: "identity", label: "Identity", fields: ["thumbprint", "keyAlgorithm", "keySize", "signature", "version", "issuer", "policies"],
          sections: [{ id: "advanced", label: "Advanced", collapsed: true, fields: ["type"] }] },
        { id: "related", label: "Related", fields: ["related"] },
        { id: "history", label: "History", fields: ["trend", "history", "changes"] }
      ],
      tabs: [
        { id: "overview", label: "Overview", sections: ["validity", "ownership"] },
        { id: "fields", label: "Fields", sections: ["names", "identity"] },
        { id: "related", label: "Related", sections: ["related"] },
        { id: "history", label: "History", sections: ["history"] }
      ],
      deepLink: true
    },
    source: { kind: "inline" },
    rows: Array.from({ length: count }, (_, i) => certificate(i, count)),
    ...extra
  };
}

/** Opens a page with the view, routed at a fixed file name so record addresses stay stable. */
export async function open(page, view, hash = "") {
  await page.route("http://canopyx.test/records.html", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/records.html" + hash);
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(api + ".ready");
}

export const drawer = page => page.locator("dialog.cx-drawer");
