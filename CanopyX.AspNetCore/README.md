# CanopyX.AspNetCore

Minimal-API endpoints for the CanopyX remote grid protocol, built on `CanopyX.Data`.

```csharp
var map = new CanopyColumnMap<Host>(view)
    .Key(x => x.Id)
    .Column("name", x => x.Name)
    .Column("owner", x => x.Owner.Name);

app.MapCanopyRemote("/api/hosts", http => http.RequestServices.GetRequiredService<FleetDb>().Hosts, map)
   .RequireAuthorization();
```

The group serves `POST query`, `GET query`, `POST facet`, `POST summary`, `POST export/{format}` and `GET view`.
`CanopyRemoteScript.Element(map.Schema, "/api/hosts")` writes the browser script that connects the grid to them.
See `docs/remote-dotnet.md` in the repository.
