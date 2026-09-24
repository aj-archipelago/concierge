/** @jest-environment node */
import { load } from "cheerio";
import {
    widgetPreviewDocument,
    WIDGET_TAILWIND_URL,
} from "./widget-preview-document";

test("isolates untrusted candidate HTML while preserving its layout and inline behavior", () => {
    const html = widgetPreviewDocument(
        `<html lang="en"><head><base href="http://localhost"><meta http-equiv="refresh" content="0;url=http://localhost"><script src="/applet-sdk.js"></script><link rel="stylesheet" href="http://localhost/private"></head><body><iframe src="http://localhost"></iframe><style>.card{padding:20px}</style><script>document.body.dataset.ready='yes'</script><button>Go</button></body></html>`,
        { theme: "dark", language: "ar", width: 360 },
    );
    const $ = load(html);
    expect($("html").attr("dir")).toBe("rtl");
    expect($("html").attr("lang")).toBe("ar");
    expect($("html").attr("data-theme")).toBe("dark");
    expect($("base,iframe,link,meta[http-equiv=refresh]")).toHaveLength(0);
    expect(
        $("script[src]")
            .map((_, el) => $(el).attr("src"))
            .get(),
    ).toEqual([WIDGET_TAILWIND_URL]);
    expect(
        $("meta[http-equiv=Content-Security-Policy]").attr("content"),
    ).toContain("connect-src 'none'");
    expect(html).toContain("document.body.dataset.ready='yes'");
    expect(html).toContain("Preview: live action unavailable");
});
