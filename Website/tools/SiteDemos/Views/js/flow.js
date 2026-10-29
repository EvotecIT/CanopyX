import { createFlow } from "@evotecit/canopyx/flow";
import "@evotecit/canopyx/flow-entry.css";

const flow = createFlow(document.getElementById("flow"), {
  flow: {
    kind: "flow", version: 1, id: "service-setup",
    title: "Set up the reporting service",
    description: "Finish the tasks in any order. "
      + "The service starts once every required task is complete.",
    mode: "tasks",
    steps: [
      {
        id: "database", title: "Connect the database", group: "Connect",
        fields: [
          {
            id: "engine", type: "choice", label: "Database engine",
            required: true, default: "sql",
            options: [
              { value: "sql", label: "SQL Server" },
              { value: "pg", label: "PostgreSQL" }
            ]
          },
          {
            id: "server", type: "text", label: "Server", required: true,
            help: "A host name, with a port when it is not the default."
          },
          {
            id: "name", type: "text", label: "Database name",
            required: true, default: "reports", width: "half"
          }
        ]
      },
      {
        id: "mail", title: "Choose who gets notified", group: "Connect",
        fields: [
          {
            id: "admins", type: "list", label: "Administrators", required: true,
            validation: { minItems: 1, maxItems: 10, item: "email" }
          },
          {
            id: "digest", type: "toggle", label: "Send a daily digest",
            default: true
          }
        ]
      },
      {
        id: "branding", title: "Add your branding", group: "Content",
        optional: true,
        fields: [
          { id: "company", type: "text", label: "Company name" },
          {
            id: "accent", type: "choice", label: "Accent colour", default: "teal",
            options: [
              { value: "teal", label: "Teal" },
              { value: "blue", label: "Blue" }
            ]
          }
        ]
      },
      {
        id: "review", type: "review",
        declaration: "Starting the service runs the first schedules today."
      }
    ],
    submit: { label: "Start the service" }
  },
  // CanopyX never writes: post the answers to your service and say what happened.
  onSubmit: async detail => {
    const response = await fetch("/api/reporting/setup", {
      method: "POST",
      body: JSON.stringify(detail.values)
    });
    return response.ok
      ? { status: "saved", message: "The service is starting." }
      : { status: "error", message: "Not saved." };
  }
});
