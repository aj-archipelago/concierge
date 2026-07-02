import { extractWidgets, restoreWidgets } from "../widgetUtils";

describe("widgetUtils", () => {
    test("extracts widget HTML with inert parsing and restores it", () => {
        const input =
            '<p>Intro</p><div html="&lt;span&gt;Widget&lt;/span&gt;"><em>Widget preview</em></div><p>Outro</p>';

        const result = extractWidgets(input);

        expect(result.html).toBe(
            '<p>Intro</p><div id="widget-1">widget-1</div><p>Outro</p>',
        );
        expect(result.widgets.get("widget-1")).toBe(
            '<div html="<span>Widget</span>"><em>Widget preview</em></div>',
        );
        expect(restoreWidgets(result.html, result.widgets)).toBe(
            '<p>Intro</p><div html="<span>Widget</span>"><em>Widget preview</em></div><p>Outro</p>',
        );
    });

    test("keeps script text inside extracted widgets out of placeholder HTML", () => {
        const result = extractWidgets(
            '<div html="&lt;script&gt;alert(1)&lt;/script&gt;"><script>alert(1)</script></div><p>Safe</p>',
        );

        expect(result.html).toBe(
            '<div id="widget-1">widget-1</div><p>Safe</p>',
        );
        expect(result.widgets.get("widget-1")).toContain("<script>");
        expect(result.widgets.get("widget-1")).toContain(
            'html="<script>alert(1)</script>"',
        );
    });
});
