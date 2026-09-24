import {
    regenerateWidgetHtml,
    loadOrCreateWidgetHtml,
} from "../appletWidgetHtml.js";

test("manual regeneration uses the coordinated widget endpoint and does not save", async () => {
    global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({ status: "ready", html: "reviewed" }),
    }));
    await expect(regenerateWidgetHtml("applet-1", (key) => key)).resolves.toBe(
        "reviewed",
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(
        "/api/canvas-applets/applet-1/widget",
    );
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
        regenerationId: expect.any(String),
        retry: true,
        regenerate: true,
    });
});

test("limits active browser preparation to two while saved widgets load immediately", async () => {
    const pending = [];
    let active = 0,
        peak = 0;
    global.fetch = jest.fn(async (url, options = {}) => {
        if (String(url).includes("cached-widget"))
            return {
                ok: true,
                json: async () => ({ applet: { runtimeHtml: "cached" } }),
            };
        if (!options.method)
            return {
                ok: false,
                status: 404,
                json: async () => ({ code: "WIDGET_MISSING" }),
            };
        active++;
        peak = Math.max(peak, active);
        return new Promise((resolve) =>
            pending.push(() => {
                active--;
                resolve({
                    ok: true,
                    json: async () => ({ status: "ready", html: "complete" }),
                });
            }),
        );
    });
    const loads = Array.from({ length: 6 }, (_, i) =>
        loadOrCreateWidgetHtml(`limited-${i}`, (k) => k),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(active).toBe(2);
    await expect(
        loadOrCreateWidgetHtml("cached-widget", (k) => k),
    ).resolves.toBe("cached");
    for (let i = 0; i < 6; i++) {
        pending.shift()();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await Promise.all(loads);
    expect(peak).toBe(2);
});
