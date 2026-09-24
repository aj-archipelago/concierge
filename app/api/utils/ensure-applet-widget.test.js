import {
    ensureAppletWidget,
    widgetSourceVersion,
} from "./ensure-applet-widget";

const applet = {
    _id: "applet",
    updatedAt: new Date("2026-09-12"),
    htmlVersions: [],
};
function setup(state = { status: "claimed", token: "one" }) {
    return {
        applet,
        coordinator: {
            claim: jest.fn().mockResolvedValue(state),
            finish: jest.fn().mockResolvedValue(),
        },
        generate: jest.fn().mockResolvedValue("<html>complete</html>"),
        save: jest.fn(async (html) => html),
    };
}

test.each(["running", "queued", "failed"])(
    "does not regenerate a %s operation",
    async (status) => {
        const options = setup({ status });
        expect((await ensureAppletWidget(options)).status).toBe(status);
        expect(options.generate).not.toHaveBeenCalled();
    },
);

test("checkpoints complete HTML before attempting a database save", async () => {
    const options = setup();
    options.save.mockImplementation(async (html) => {
        expect(options.coordinator.finish).toHaveBeenCalledWith(
            "applet",
            "one",
            "ready",
            html,
        );
        return html;
    });
    expect(await ensureAppletWidget(options)).toEqual({
        status: "ready",
        html: "<html>complete</html>",
    });
});

test("retries a failed save on another request without regenerating", async () => {
    const first = setup();
    first.save.mockRejectedValue(new Error("Database temporarily unavailable"));
    expect(await ensureAppletWidget(first)).toEqual({
        status: "failed",
        code: "WIDGET_SAVE_FAILED",
    });
    const checkpoint = first.coordinator.finish.mock.calls[0][3];
    const reopened = setup({ status: "ready", html: checkpoint });
    expect(await ensureAppletWidget(reopened)).toEqual({
        status: "ready",
        html: checkpoint,
    });
    expect(reopened.generate).not.toHaveBeenCalled();
});

test("records generation failure without saving partial output", async () => {
    const options = setup();
    options.generate.mockRejectedValue(new Error("Stream interrupted"));
    expect((await ensureAppletWidget(options)).code).toBe(
        "WIDGET_GENERATION_FAILED",
    );
    expect(options.save).not.toHaveBeenCalled();
    expect(options.coordinator.finish).toHaveBeenCalledWith(
        "applet",
        "one",
        "failed",
        "WIDGET_GENERATION_FAILED",
    );
});

test("fails closed when coordination is unavailable", async () => {
    const options = setup();
    options.coordinator.claim.mockRejectedValue(new Error("Redis unavailable"));
    await expect(ensureAppletWidget(options)).rejects.toThrow(
        "Redis unavailable",
    );
    expect(options.generate).not.toHaveBeenCalled();
});

test("still saves finished HTML if its Redis checkpoint fails", async () => {
    const options = setup();
    options.coordinator.finish.mockRejectedValue(
        new Error("Redis unavailable"),
    );
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect((await ensureAppletWidget(options)).status).toBe("ready");
    warn.mockRestore();
});

test("source identity changes when an applet is edited", () => {
    expect(widgetSourceVersion(applet)).not.toBe(
        widgetSourceVersion({ ...applet, updatedAt: new Date("2026-09-13") }),
    );
});

test("does not promise a cached save retry if both persistence stores failed", async () => {
    const options = setup();
    options.coordinator.finish.mockRejectedValue(
        new Error("Redis unavailable"),
    );
    options.save.mockRejectedValue(new Error("Database unavailable"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect((await ensureAppletWidget(options)).code).toBe("WIDGET_INTERRUPTED");
    warn.mockRestore();
});
