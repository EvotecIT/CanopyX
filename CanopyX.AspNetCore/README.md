# CanopyX.AspNetCore

Minimal-API endpoints for the CanopyX remote grid protocol, built on `CanopyX.Data`: a data grid in the browser that pages, filters, totals, exports and saves edits against your database.

![A hosted CanopyX data grid: grouped devices with filters, totals and export, answered by the server](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/inventory-light.png)

```csharp
var map = new CanopyColumnMap<Host>(view)
    .Key(x => x.Id)
    .Column("name", x => x.Name)
    .Column("owner", x => x.Owner.Name);

app.MapCanopyRemote("/api/hosts", http => http.RequestServices.GetRequiredService<FleetDb>().Hosts, map, options => {
    options.AuthorizationPolicy = "Inventory.Read";
});
```

The group serves `POST query`, `GET query`, `POST facet`, `POST summary`, `POST export/{format}` and `GET view`. With
`options.Writer` it also serves `POST commit`, which requires `options.WriteAuthorizationPolicy` on top of the read policy.
With a `CanopyRecordMap<T>` (or `options.Records`) it serves `POST record`, the record panel's details on demand, looked up
through the same query callback.
`CanopyRemoteScript.Element(map.Schema, "/api/hosts")` writes the browser script that connects the grid to them.
Under a nonce-based Content Security Policy, use `CanopyRemoteScript.ElementWithNonce(map.Schema, "/api/hosts", nonce)`
with the same response nonce as the page.
The guide [Server-side data for .NET](https://github.com/EvotecIT/CanopyX/blob/main/docs/remote-dotnet.md) walks through a complete setup, and the [live demos](https://canopyx.dev/views/inventory/) show what readers get.
