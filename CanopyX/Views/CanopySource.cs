using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Declares where the runtime reads a view's nodes from. Create instances with <see cref="Inline"/>,
/// <see cref="Sidecar"/>, <see cref="Remote"/>, or <see cref="RemoteQuery"/>.
/// </summary>
public sealed class CanopySource {
    private CanopySource(CanopySourceKind kind, string? baseUrl, string? childrenUrl, string? searchUrl, string? countsUrl, bool queryAware = false) {
        Kind = kind;
        BaseUrl = baseUrl;
        ChildrenUrl = childrenUrl;
        SearchUrl = searchUrl;
        CountsUrl = countsUrl;
        QueryAware = queryAware;
    }

    /// <summary>Gets the kind of source.</summary>
    public CanopySourceKind Kind { get; }

    /// <summary>Gets the folder that holds the sidecar files, relative to the page (sidecar sources).</summary>
    public string? BaseUrl { get; }

    /// <summary>Gets the children URL template with <c>{ref}</c> and <c>{cursor}</c> placeholders (remote sources).</summary>
    public string? ChildrenUrl { get; }

    /// <summary>Gets the search URL template with <c>{query}</c> and <c>{limit}</c> placeholders (remote sources).</summary>
    public string? SearchUrl { get; }

    /// <summary>Gets the counts URL template with an <c>{ids}</c> placeholder (remote sources).</summary>
    public string? CountsUrl { get; }

    /// <summary>Gets whether the host orders and filters the complete dataset using the view query.</summary>
    public bool QueryAware { get; }

    /// <summary>Nodes travel inside the view document. Use for single-file pages.</summary>
    /// <returns>An inline source.</returns>
    public static CanopySource Inline() => new CanopySource(CanopySourceKind.Inline, null, null, null, null);

    /// <summary>Nodes live in sidecar script files written by the bundle writer.</summary>
    /// <param name="baseUrl">The folder holding the sidecar files, relative to the page, for example <c>data/files/</c>.</param>
    /// <returns>A sidecar source.</returns>
    /// <exception cref="ArgumentException"><paramref name="baseUrl"/> is null, empty, or contains a query or fragment.</exception>
    public static CanopySource Sidecar(string baseUrl) {
        if (string.IsNullOrEmpty(baseUrl)) {
            throw new ArgumentException("Sidecar base URL is required.", nameof(baseUrl));
        }

        if (baseUrl.IndexOfAny(new[] { '?', '#' }) >= 0) {
            throw new ArgumentException("Sidecar base URL must be a folder path without a query or fragment.", nameof(baseUrl));
        }

        return new CanopySource(CanopySourceKind.Sidecar, baseUrl.EndsWith("/", StringComparison.Ordinal) ? baseUrl : baseUrl + "/", null, null, null);
    }

    /// <summary>Nodes come from HTTP endpoints that answer with <c>canopyx/2</c> documents.</summary>
    /// <param name="childrenUrl">
    /// Template for a page of children, for example <c>api/tree/children?ref={ref}&amp;cursor={cursor}</c>. The root
    /// level is requested with an empty <c>{ref}</c>; <c>{cursor}</c> is empty for the first page and otherwise the
    /// <c>next</c> value of the previous page.
    /// </param>
    /// <param name="searchUrl">Optional template for search, for example <c>api/tree/search?q={query}&amp;limit={limit}</c>.</param>
    /// <param name="countsUrl">Optional template for counts, for example <c>api/tree/counts?ids={ids}</c>.</param>
    /// <returns>A remote source.</returns>
    /// <exception cref="ArgumentException">A template is missing a required placeholder.</exception>
    public static CanopySource Remote(string childrenUrl, string? searchUrl = null, string? countsUrl = null) {
        return CreateRemote(childrenUrl, searchUrl, countsUrl, false);
    }

    /// <summary>Creates a remote source whose host applies sorting and declared filters before paging.</summary>
    /// <param name="childrenUrl">A children template containing <c>{ref}</c>, <c>{cursor}</c>, and <c>{viewQuery}</c>.</param>
    /// <param name="searchUrl">Optional search template containing <c>{query}</c>, <c>{limit}</c>, and <c>{viewQuery}</c>.</param>
    /// <param name="countsUrl">Optional counts template containing <c>{ids}</c> and <c>{viewQuery}</c>.</param>
    /// <returns>A query-aware remote source. Every page, search result, and counts document identifies the host's dataset revision.</returns>
    /// <remarks>Templates may also contain <c>{revision}</c>; it is empty for a new root query and otherwise names the accepted snapshot.</remarks>
    /// <exception cref="ArgumentException">A template is missing a required placeholder before its fragment.</exception>
    public static CanopySource RemoteQuery(string childrenUrl, string? searchUrl = null, string? countsUrl = null) {
        return CreateRemote(childrenUrl, searchUrl, countsUrl, true);
    }

    private static CanopySource CreateRemote(string childrenUrl, string? searchUrl, string? countsUrl, bool queryAware) {
        Require(childrenUrl, nameof(childrenUrl), "{ref}", "{cursor}");
        if (searchUrl != null) {
            Require(searchUrl, nameof(searchUrl), "{query}", "{limit}");
        }

        if (countsUrl != null) {
            Require(countsUrl, nameof(countsUrl), "{ids}");
        }

        if (queryAware) {
            Require(childrenUrl, nameof(childrenUrl), "{viewQuery}");
            if (searchUrl != null) Require(searchUrl, nameof(searchUrl), "{viewQuery}");
            if (countsUrl != null) Require(countsUrl, nameof(countsUrl), "{viewQuery}");
        }
        return new CanopySource(CanopySourceKind.Remote, null, childrenUrl, searchUrl, countsUrl, queryAware);
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("kind", CanopyJsonNames.SourceKind(Kind));
        writer.OptionalProperty("base", BaseUrl);
        writer.OptionalProperty("children", ChildrenUrl);
        writer.OptionalProperty("search", SearchUrl);
        writer.OptionalProperty("counts", CountsUrl);
        if (QueryAware) writer.Property("queryAware", true);
        writer.EndObject();
    }

    private static void Require(string template, string parameter, params string[] placeholders) {
        if (string.IsNullOrEmpty(template)) {
            throw new ArgumentException("URL template is required.", parameter);
        }

        var fragment = template.IndexOf('#');
        var request = fragment < 0 ? template : template.Substring(0, fragment);
        foreach (var placeholder in placeholders) {
            if (request.IndexOf(placeholder, StringComparison.Ordinal) < 0) {
                throw new ArgumentException("URL template must contain " + placeholder + " before its fragment.", parameter);
            }
        }
    }
}
