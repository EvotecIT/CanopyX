using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The routes that answer a flow's hooks without script (<see cref="CanopyFlow.Endpoint"/>): CanopyX.AspNetCore's <c>MapCanopyFlow</c>
/// serves them below <see cref="Url"/>, and the browser posts JSON to <c>&lt;url&gt;/&lt;route&gt;</c> on the page's own origin with
/// the page's cookies. Hooks the host registers in the browser take precedence over the routes.
/// </summary>
public sealed class CanopyFlowEndpoint {
    internal static readonly (string Wire, CanopyFlowRoutes Value)[] RouteNames = {
        ("options", CanopyFlowRoutes.Options), ("fields", CanopyFlowRoutes.Fields), ("check", CanopyFlowRoutes.Check), ("validate", CanopyFlowRoutes.Validate),
        ("preview", CanopyFlowRoutes.Preview), ("status", CanopyFlowRoutes.Status), ("draft", CanopyFlowRoutes.Draft), ("submit", CanopyFlowRoutes.Submit)
    };

    /// <summary>Creates an endpoint.</summary>
    /// <param name="url">The route group's path on the page's own origin, for example <c>/api/flows/mail</c>.</param>
    /// <param name="routes">The routes it serves.</param>
    public CanopyFlowEndpoint(string url, CanopyFlowRoutes routes) {
        Url = url;
        Routes = routes;
    }

    /// <summary>Gets or sets the route group's path: an absolute path on the page's own origin, at most 512 characters.</summary>
    public string Url { get; set; }

    /// <summary>Gets or sets the routes the endpoint serves.</summary>
    public CanopyFlowRoutes Routes { get; set; }

    internal void Validate() {
        if (Url == null || Url.Length < 1 || Url.Length > 512 || Url[0] != '/' || Url.StartsWith("//", StringComparison.Ordinal)) throw new InvalidOperationException("The endpoint is a path on the page's own origin.");
        foreach (var ch in Url) {
            if (!(ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' || "_-./~%".IndexOf(ch) >= 0)) throw new InvalidOperationException("The endpoint path has a character outside letters, digits and -_./~%.");
        }

        var all = CanopyFlowRoutes.None;
        foreach (var route in RouteNames) all |= route.Value;
        if (Routes == CanopyFlowRoutes.None || (Routes & ~all) != 0) throw new InvalidOperationException("The endpoint serves at least one known route.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        var routes = new List<string>();
        foreach (var route in RouteNames) if ((Routes & route.Value) != 0) routes.Add(route.Wire);
        writer.BeginObject().Property("url", Url).StringArray("routes", routes).EndObject();
    }

    internal static CanopyFlowEndpoint Read(object? node) {
        const string what = "The endpoint";
        var map = CanopyFlowContract.Object(node, what, "url", "routes");
        var routes = CanopyFlowRoutes.None;
        foreach (var item in CanopyFlowContract.Items(map, "routes", what, RouteNames.Length)) {
            var route = CanopyFlowContract.Choose(item as string, what, "routes", RouteNames);
            if ((routes & route) != 0) throw new InvalidOperationException(what + " lists a route twice.");
            routes |= route;
        }

        return new CanopyFlowEndpoint(CanopyFlowContract.RequiredText(map, "url", what), routes);
    }
}