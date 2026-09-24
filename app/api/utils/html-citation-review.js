import { load } from "cheerio";

/** Inspect new HTML only. Stored outputs are never rewritten by this check. */
export function reviewHtmlCitations(html) {
    if (!html) return [];
    const $ = load(String(html));
    // Native Markdown payloads and literal examples legitimately use directives.
    $("script,style,pre,code,template").remove();
    const text = $.root().text();
    const attributes = $("[title],[aria-label],[placeholder],[alt],[href]")
        .toArray()
        .flatMap((el) =>
            ["title", "aria-label", "placeholder", "alt", "href"].map((key) =>
                $(el).attr(key),
            ),
        )
        .join(" ");
    if (!/:cd_source\s*\[/i.test(`${text} ${attributes}`)) return [];
    return [
        {
            code: "HTML_CITATION_FORMAT",
            message:
                "HTML contains unresolved citation markers. Use ordinary source links with URLs from the source records; do not remove the attribution or invent URLs.",
        },
    ];
}

/** Check both documents before writing either, without replaying agent actions. */
export function assertNewAutomationCitations({ html, widgetHtml }) {
    for (const [field, content] of Object.entries({ html, widgetHtml })) {
        const issue = reviewHtmlCitations(content)[0];
        if (issue) {
            throw Object.assign(new Error(`${field}: ${issue.message}`), {
                code: issue.code,
            });
        }
    }
}
