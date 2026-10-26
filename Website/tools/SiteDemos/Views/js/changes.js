import { createChangeList } from "@evotecit/canopyx/grid";
import "@evotecit/canopyx/grid.css";

const unc = path => "\\\\fs01\\deploy\\" + path.replaceAll("/", "\\");
const seen = "2026-10-21T10:42:00Z";

createChangeList(document.getElementById("changes"), {
  view: {
    protocol: "canopyx/2", type: "changes", id: "share-changes",
    label: "Changes on the deployment share",
    actions: [
      { id: "copy-path", label: "Copy the path", icon: "copy", copy: "unc" },
      { id: "acknowledge", label: "Acknowledge", icon: "check" }
    ],
    items: [
      {
        id: "payload", kind: "added", path: "Scripts/Logon/agent.exe",
        after: {
          size: 1248256,
          hash: "9f2c41d07be35a18c6e0d4f9a2b7c3e15d8f60a4b9c2e7d1f3a5b8c0d2e4f6a8",
          time: seen
        },
        flags: [{
          id: "unsigned", label: "Unsigned", tone: "danger",
          reason: "The file has no embedded signature."
        }],
        values: { unc: unc("Scripts/Logon/agent.exe") }
      },
      {
        id: "settings", kind: "modified", path: "Config/settings.ini",
        before: { size: 612, time: "2026-09-11T10:42:00Z" },
        after: { size: 618, time: seen },
        values: { unc: unc("Config/settings.ini") },
        // With only the two texts, the browser computes the diff.
        diff: {
          id: "settings-diff",
          label: "settings.ini",
          before: "[agent]\nchannel=stable\ninterval=60\n",
          after: "[agent]\nchannel=preview\ninterval=60\n"
        }
      },
      {
        id: "legacy", kind: "removed", path: "Tools/legacy-inventory.vbs",
        before: { size: 3904, time: "2025-09-16T10:42:00Z" },
        values: { unc: unc("Tools/legacy-inventory.vbs") }
      }
    ]
  }
});
