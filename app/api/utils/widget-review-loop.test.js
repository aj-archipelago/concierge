/** @jest-environment node */
import { buildReviewedWidget } from "./widget-review-loop";

test("always inspects the rendered design before accepting it", async () => {
    const generate = jest
        .fn()
        .mockResolvedValueOnce("first")
        .mockResolvedValueOnce("repaired");
    const inspect = jest.fn().mockResolvedValue({
        issues: [],
        screenshot: "data:image/jpeg;base64,preview",
    });
    expect(
        await buildReviewedWidget({ sourceHtml: "source", generate, inspect }),
    ).toBe("repaired");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toMatchObject({
        currentHtml: "first",
        screenshot: "data:image/jpeg;base64,preview",
    });
    expect(inspect.mock.calls.map(([html]) => html)).toEqual([
        "first",
        "repaired",
    ]);
});

test("repairs measured failures and refuses an unqualified final candidate", async () => {
    const generate = jest.fn().mockResolvedValue("still clipped");
    const inspect = jest.fn().mockResolvedValue({
        issues: [{ code: "clipped-control", variant: "Arabic dark" }],
        screenshot: "preview",
    });
    await expect(
        buildReviewedWidget({ sourceHtml: "source", generate, inspect }),
    ).rejects.toMatchObject({ code: "WIDGET_QUALITY_FAILED" });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(generate.mock.calls[1][0].prompt).toContain("clipped-control");
});

test("does not accept HTML when the renderer is unavailable", async () => {
    const generate = jest.fn().mockResolvedValue("candidate");
    const inspect = jest
        .fn()
        .mockRejectedValue(new Error("Browser unavailable"));
    await expect(
        buildReviewedWidget({ sourceHtml: "source", generate, inspect }),
    ).rejects.toThrow("Browser unavailable");
    expect(generate).toHaveBeenCalledTimes(1);
});

test("repairs citation markers even when visual measurements pass", async () => {
    const generate = jest
        .fn()
        .mockResolvedValueOnce("<p>Evidence :cd_source[abc-1]</p>")
        .mockResolvedValueOnce(
            '<p>Evidence <a href="https://example.com/report">Source</a></p>',
        );
    const inspect = jest
        .fn()
        .mockResolvedValue({ issues: [], screenshot: "preview" });
    await expect(
        buildReviewedWidget({ sourceHtml: "source", generate, inspect }),
    ).resolves.toContain('href="https://example.com/report"');
    expect(generate.mock.calls[1][0].prompt).toContain("HTML_CITATION_FORMAT");
});
