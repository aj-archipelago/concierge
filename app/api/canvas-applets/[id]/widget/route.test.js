/** @jest-environment node */
import { buildReviewedWidget } from "../../../utils/widget-review-loop";
import { ReadableStream } from "node:stream/web";
import { POST } from "./route";
import { getCurrentUser } from "../../../utils/auth";
import { createAppletGenerationResponse } from "../../../utils/generate-applet-response";
import { getWidgetGenerationCoordinator } from "../../../utils/widget-generation-coordinator";
import {
    loadAppletForWidgetGeneration,
    resolveInstalledAppletRuntime,
    saveGeneratedAppletWidget,
} from "../../registry";

jest.mock("../../../utils/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("../../../utils/generate-applet-response", () => ({
    createAppletGenerationResponse: jest.fn(),
}));
jest.mock("../../../utils/widget-generation-coordinator", () => ({
    getWidgetGenerationCoordinator: jest.fn(),
}));
jest.mock("../../registry", () => ({
    loadAppletForWidgetGeneration: jest.fn(),
    resolveInstalledAppletRuntime: jest.fn(),
    saveGeneratedAppletWidget: jest.fn(),
}));
jest.mock("../../../utils/render-widget-preview", () => ({
    renderWidgetPreview: jest.fn(),
}));
jest.mock("../../../utils/widget-review-loop", () => ({
    WIDGET_REVIEW_VERSION: 1,
    buildReviewedWidget: jest.fn(async ({ generate }) =>
        generate({ prompt: "review", currentHtml: "source" }),
    ),
}));
const id = "69f8bd4c228576a41dcc47c3";
const user = { _id: "owner" };
const applet = { _id: id, updatedAt: new Date("2026-09-12") };
const coordinator = { claim: jest.fn(), finish: jest.fn() };
const request = (body = {}) => ({ json: async () => body });
const params = { params: Promise.resolve({ id }) };

beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUser.mockResolvedValue(user);
    loadAppletForWidgetGeneration.mockResolvedValue(applet);
    getWidgetGenerationCoordinator.mockReturnValue(coordinator);
    coordinator.claim.mockResolvedValue({ status: "claimed", token: "one" });
    coordinator.finish.mockResolvedValue();
    resolveInstalledAppletRuntime.mockResolvedValue({
        html: "<html>full source</html>",
    });
    saveGeneratedAppletWidget.mockImplementation(
        async (_user, _id, html) => html,
    );
});

test("rejects an unauthenticated request before touching generation state", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await POST(request(), params)).status).toBe(401);
    expect(getWidgetGenerationCoordinator).not.toHaveBeenCalled();
});

test("requires edit access before reading cached private widget HTML", async () => {
    loadAppletForWidgetGeneration.mockRejectedValue(
        Object.assign(new Error("Forbidden"), { status: 403 }),
    );
    expect((await POST(request(), params)).status).toBe(403);
    expect(getWidgetGenerationCoordinator).not.toHaveBeenCalled();
});

test("returns existing widgets without model or Redis work", async () => {
    loadAppletForWidgetGeneration.mockResolvedValue({
        ...applet,
        widgetHtml: "<html>existing</html>",
    });
    expect((await (await POST(request(), params)).json()).html).toContain(
        "existing",
    );
    expect(getWidgetGenerationCoordinator).not.toHaveBeenCalled();
});

test("returns a non-cacheable pending response without loading source HTML", async () => {
    coordinator.claim.mockResolvedValue({ status: "queued" });
    const response = await POST(request(), params);
    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(resolveInstalledAppletRuntime).not.toHaveBeenCalled();
});

test("saves a terminal result even after the requesting browser disconnects", async () => {
    let streamController;
    createAppletGenerationResponse.mockResolvedValue({
        ok: true,
        body: new ReadableStream({
            start(controller) {
                streamController = controller;
            },
        }),
    });
    const controller = new AbortController();
    const responsePromise = POST(
        { ...request(), signal: controller.signal },
        params,
    );
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    streamController.enqueue(
        new TextEncoder().encode(
            'data: {"event":"complete","data":{"html":"<html>complete</html>"}}\n\n',
        ),
    );
    const response = await responsePromise;
    expect((await response.json()).status).toBe("ready");
    expect(saveGeneratedAppletWidget).toHaveBeenCalledWith(
        user,
        id,
        "<html>complete</html>",
        applet.updatedAt,
    );
    expect(createAppletGenerationResponse.mock.calls[0][1]).toEqual({
        timeoutMs: 150000,
        maxAttempts: 1,
        deferCitationReview: true,
    });
});

test("manual regeneration returns a reviewed preview without overwriting the saved widget", async () => {
    loadAppletForWidgetGeneration.mockResolvedValue({
        ...applet,
        widgetHtml: "original",
    });
    buildReviewedWidget.mockResolvedValueOnce("<html>reviewed</html>");
    const response = await POST(request({ regenerate: true }), params);
    expect((await response.json()).html).toContain("reviewed");
    expect(saveGeneratedAppletWidget).not.toHaveBeenCalled();
    expect(loadAppletForWidgetGeneration).toHaveBeenCalledTimes(2);
});

test("failed quality review leaves the widget unchanged", async () => {
    buildReviewedWidget.mockRejectedValueOnce(
        Object.assign(new Error("Clipped"), { code: "WIDGET_QUALITY_FAILED" }),
    );
    expect((await (await POST(request(), params)).json()).code).toBe(
        "WIDGET_QUALITY_FAILED",
    );
    expect(saveGeneratedAppletWidget).not.toHaveBeenCalled();
});

test("manual preview rechecks edit access after review", async () => {
    loadAppletForWidgetGeneration
        .mockResolvedValueOnce(applet)
        .mockRejectedValueOnce(
            Object.assign(new Error("Forbidden"), { status: 403 }),
        );
    buildReviewedWidget.mockResolvedValueOnce("<html>reviewed</html>");
    expect(
        (await (await POST(request({ regenerate: true }), params)).json())
            .status,
    ).toBe("failed");
    expect(saveGeneratedAppletWidget).not.toHaveBeenCalled();
});
