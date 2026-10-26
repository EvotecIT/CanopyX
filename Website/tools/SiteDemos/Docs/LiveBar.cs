using System.Text;

namespace SiteDemos.Docs;

/// <summary>
/// Gives a full-screen demo page the site's header as a slim bar: the brand, the way back to the demos and the theme
/// switch, sharing the site's stored theme. Inside a frame on canopyx.dev the bar stays hidden and the site's own
/// script themes the grid, so the embedded demos keep all their space.
/// </summary>
internal static class LiveBar {
    private const string Logo = "<svg viewBox=\"0 0 32 32\" width=\"24\" height=\"24\" aria-hidden=\"true\" focusable=\"false\"><rect width=\"32\" height=\"32\" rx=\"8\" fill=\"#0f3d27\"/><path d=\"M6.5 8.2 9 10.4l2.5-2.2\" fill=\"none\" stroke=\"#74c69a\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"13\" y=\"8\" width=\"13\" height=\"3\" rx=\"1.5\" fill=\"#74c69a\"/><path d=\"M9 13v10.5M9 17h4M9 23.5h4\" fill=\"none\" stroke=\"#74c69a\" stroke-width=\"1.4\" stroke-linecap=\"round\" opacity=\".7\"/><rect x=\"15\" y=\"15.5\" width=\"11\" height=\"3\" rx=\"1.5\" fill=\"#c3ecd2\"/><rect x=\"15\" y=\"22\" width=\"8\" height=\"3\" rx=\"1.5\" fill=\"#c3ecd2\" opacity=\".75\"/></svg>";

    private const string Style = "<style>\n"
        + "@font-face{font-family:\"Schibsted Grotesk\";font-weight:400 900;font-display:swap;src:url(/fonts/schibsted-grotesk-latin.woff2) format(\"woff2\")}\n"
        + ":root{--bar-bg:#f3f5f4;--bar-line:#dfe5e2;--bar-ink:#0d1f1a;--bar-ink-2:#3f514a;--bar-accent:#0b7a55;--bar-select:#e3f2eb;--bar-focus:#b46a00}\n"
        + ":root[data-theme=dark]{--bar-bg:#0b1311;--bar-line:#213029;--bar-ink:#e4ede9;--bar-ink-2:#a9b9b2;--bar-accent:#4fcc95;--bar-select:#14332a;--bar-focus:#f0b85c}\n"
        + ":root[data-theme=dark] body.cx-page{background:#0b1311}\n"
        + ".cnx-livebar{box-sizing:border-box;display:flex;align-items:center;gap:14px;height:48px;padding:0 16px;border-bottom:1px solid var(--bar-line);background:var(--bar-bg);color:var(--bar-ink);font:600 14px/1.2 \"Schibsted Grotesk\",system-ui,sans-serif}\n"
        + ".cnx-livebar a{color:inherit;text-decoration:none}.cnx-livebar a:hover{color:var(--bar-accent)}\n"
        + ".cnx-livebar :focus-visible{outline:2px solid var(--bar-focus);outline-offset:2px;border-radius:4px}\n"
        + ".cnx-livebar__brand{display:inline-flex;align-items:center;gap:8px;font-size:16px;font-weight:760;letter-spacing:-.01em}\n"
        + ".cnx-livebar__crumb{display:flex;align-items:center;gap:8px;min-width:0;color:var(--bar-ink-2);font-weight:560}\n"
        + ".cnx-livebar__crumb b{overflow:hidden;padding:2px 8px 2px 9px;border-radius:0 4px 4px 0;background:var(--bar-select);box-shadow:inset 2px 0 0 var(--bar-accent);color:var(--bar-ink);font-weight:640;text-overflow:ellipsis;white-space:nowrap}\n"
        + ".cnx-livebar__sep{color:var(--bar-line)}\n"
        + ".cnx-livebar__end{display:flex;align-items:center;gap:6px;margin-left:auto}\n"
        + ".cnx-livebar button{display:inline-grid;place-items:center;width:34px;height:34px;border:1px solid transparent;border-radius:8px;background:none;color:var(--bar-ink-2);cursor:pointer}\n"
        + ".cnx-livebar button:hover{border-color:var(--bar-line);color:var(--bar-ink)}\n"
        + ".cnx-livebar__back{padding:7px 12px;border:1px solid var(--bar-line);border-radius:8px}\n"
        + ".cnx-livebar__sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}\n"
        + ".cnx-livebar .moon{display:none}:root[data-theme=dark] .cnx-livebar .moon{display:block}:root[data-theme=dark] .cnx-livebar .sun{display:none}\n"
        + "html:not(.cnx-framed) body.cx-page>.cx-host,html:not(.cnx-framed) body.cx-page>.cx-main>.cx-host{height:calc(100vh - 48px);height:calc(100dvh - 48px)}\n"
        + ".cnx-framed .cnx-livebar{display:none}\n"
        + "@media (max-width:560px){.cnx-livebar__crumb>span:first-child,.cnx-livebar__sep{display:none}}\n"
        + "</style>\n";

    // Runs in the head: hide the bar inside a frame, otherwise take the theme the site stored.
    private const string HeadScript = "<script>(function(){var d=document.documentElement;if(window.self!==window.top){d.classList.add('cnx-framed');return;}"
        + "var t;try{t=localStorage.getItem('cnx-theme');}catch(e){}if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}"
        + "d.dataset.theme=t;d.style.colorScheme=t;})();</script>\n";

    // Runs after the bar: give the grid hosts the theme and switch it like the site's header does.
    private const string BodyScript = "<script>(function(){var d=document.documentElement;if(d.classList.contains('cnx-framed'))return;"
        + "function apply(t){d.dataset.theme=t;d.style.colorScheme=t;document.querySelectorAll('[data-cx-theme]').forEach(function(h){h.setAttribute('data-cx-theme',t);});}"
        + "apply(d.dataset.theme||'light');"
        + "document.querySelector('[data-cnx-live-theme]').addEventListener('click',function(){var t=d.dataset.theme==='dark'?'light':'dark';apply(t);try{localStorage.setItem('cnx-theme',t);}catch(e){}});"
        + "})();</script>\n";

    /// <summary>Adds the bar to a page written by CanopyX.</summary>
    /// <param name="path">The page.</param>
    /// <param name="title">The demo's name, shown as the current page.</param>
    /// <param name="parent">The page the demo belongs to, as an address and a name.</param>
    /// <param name="back">Where the back link goes.</param>
    /// <param name="utf8">The encoding the page is written in.</param>
    internal static void Apply(string path, string title, (string Url, string Name) parent, string back, UTF8Encoding utf8) {
        var html = File.ReadAllText(path);
        const string BodyTag = "<body class=\"cx-page\">";
        if (!html.Contains("</head>", StringComparison.Ordinal) || !html.Contains(BodyTag, StringComparison.Ordinal)) {
            throw new InvalidOperationException(path + " is not a CanopyX page; the demo bar has nowhere to go.");
        }

        var bar = "<header class=\"cnx-livebar\">"
            + "<a class=\"cnx-livebar__brand\" href=\"/\" aria-label=\"CanopyX home\">" + Logo + "<span>CanopyX</span></a>"
            + "<nav class=\"cnx-livebar__crumb\" aria-label=\"Breadcrumb\"><span class=\"cnx-livebar__sep\" aria-hidden=\"true\">/</span>"
            + "<a href=\"" + parent.Url + "\">" + parent.Name + "</a><span class=\"cnx-livebar__sep\" aria-hidden=\"true\">/</span><b aria-current=\"page\">" + title + "</b></nav>"
            + "<div class=\"cnx-livebar__end\">"
            + "<button type=\"button\" data-cnx-live-theme aria-label=\"Switch between light and dark theme\">"
            + "<svg class=\"sun\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"4.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"/><path d=\"M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\"/></svg>"
            + "<svg class=\"moon\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" aria-hidden=\"true\"><path d=\"M20 14.6A8 8 0 0 1 9.4 4a8 8 0 1 0 10.6 10.6Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linejoin=\"round\"/></svg>"
            + "</button><a class=\"cnx-livebar__back\" href=\"" + back + "\">Back<span class=\"cnx-livebar__sr\"> to " + parent.Name + "</span></a></div></header>\n";

        html = html.Replace("</head>", Style + HeadScript + "</head>", StringComparison.Ordinal)
            .Replace(BodyTag, BodyTag + "\n" + bar, StringComparison.Ordinal)
            .Replace("</body>", BodyScript + "</body>", StringComparison.Ordinal);
        File.WriteAllText(path, html, utf8);
    }
}
