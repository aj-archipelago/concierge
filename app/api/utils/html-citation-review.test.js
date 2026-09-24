/** @jest-environment node */
import {
    assertNewAutomationCitations,
    reviewHtmlCitations,
} from "./html-citation-review";

test.each([
    "<p>Evidence :cd_source[abc-1]</p>",
    "<p>Evidence &#58;cd_source&#91;abc-1&#93;</p>",
    "<p>Evidence :cd_<span>source[abc-1]</span></p>",
    '<a title=":cd_source[abc-1]">Source</a>',
])(
    "rejects raw, encoded and fragmented citation markers in new HTML: %s",
    (html) => {
        expect(reviewHtmlCitations(html)[0].code).toBe("HTML_CITATION_FORMAT");
    },
);

test("allows actual links, literal examples and native Markdown response payloads", () => {
    expect(
        reviewHtmlCitations(`<p>Evidence <a href="https://example.com/report">Source</a></p>
      <code>:cd_source[example]</code>
      <pre class="llm-output">{"markdown":"Answer :cd_source[id]","citations":[]}</pre>
      <script>const markdown="Answer :cd_source[id]";</script>
      <!-- :cd_source[comment] -->`),
    ).toEqual([]);
});

test("mixed output validates both HTML fields while leaving Markdown summary alone", () => {
    const good = {
        summary: "Summary :cd_source[abc-1]",
        html: "<p>Report</p>",
        widgetHtml: "<p>Widget</p>",
    };
    expect(() => assertNewAutomationCitations(good)).not.toThrow();
    expect(() =>
        assertNewAutomationCitations({
            ...good,
            widgetHtml: "<p>:cd_source[abc-1]</p>",
        }),
    ).toThrow("widgetHtml:");
    expect(() =>
        assertNewAutomationCitations({
            ...good,
            html: "<p>:cd_source[abc-1]</p>",
        }),
    ).toThrow("html:");
});
