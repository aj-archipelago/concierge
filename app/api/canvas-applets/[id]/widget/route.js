import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "../../../utils/auth";
import { createAppletGenerationResponse } from "../../../utils/generate-applet-response";
import { ensureAppletWidget } from "../../../utils/ensure-applet-widget";
import { getWidgetGenerationCoordinator } from "../../../utils/widget-generation-coordinator";
import { readAppletGenerationStream } from "../../../../../src/utils/readAppletGenerationStream";
import {
    buildReviewedWidget,
    WIDGET_REVIEW_VERSION,
} from "../../../utils/widget-review-loop";
import { renderWidgetPreview } from "../../../utils/render-widget-preview";
import { ensureAppletRuntimeHtml } from "../../../../../src/utils/appletSdkUtils";
import {
    loadAppletForWidgetGeneration,
    resolveInstalledAppletRuntime,
    saveGeneratedAppletWidget,
} from "../../registry";

export const dynamic = "force-dynamic";

function json(body, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            "Cache-Control": "no-store",
            ...(status === 202 ? { "Retry-After": "3" } : {}),
        },
    });
}

export async function POST(request, { params }) {
    try {
        const { id } = await params;
        if (!mongoose.Types.ObjectId.isValid(id))
            return json({ error: "Invalid applet ID" }, 400);
        const user = await getCurrentUser(false);
        if (!user?._id) return json({ error: "Unauthorized" }, 401);
        const body = await request.json();
        const applet = await loadAppletForWidgetGeneration(user, id);
        const regenerate = body.regenerate === true;
        const regenerationId =
            typeof body.regenerationId === "string" &&
            /^[a-zA-Z0-9-]{16,80}$/.test(body.regenerationId)
                ? body.regenerationId
                : "legacy";
        if (!regenerate && applet.widgetHtml?.trim()) {
            return json({
                status: "ready",
                html: ensureAppletRuntimeHtml(applet.widgetHtml, {
                    appletId: id,
                }),
            });
        }
        const result = await ensureAppletWidget({
            applet,
            retry: body.retry === true,
            generationVersion: `review-${WIDGET_REVIEW_VERSION}:${regenerate ? `preview:${regenerationId}` : "missing"}`,
            coordinator: getWidgetGenerationCoordinator(),
            generate: async () => {
                const runtime = await resolveInstalledAppletRuntime(user, id);
                return buildReviewedWidget({
                    sourceHtml: runtime.html,
                    inspect: renderWidgetPreview,
                    generate: async ({ prompt, currentHtml, screenshot }) => {
                        const response = await createAppletGenerationResponse(
                            {
                                json: async () => ({
                                    prompt,
                                    formFactor: "widget",
                                    currentHtml,
                                    screenshot,
                                }),
                            },
                            {
                                timeoutMs: 150000,
                                maxAttempts: 1,
                                deferCitationReview: true,
                            },
                        );
                        return readAppletGenerationStream(response);
                    },
                });
            },
            save: async (html) => {
                if (!regenerate)
                    return saveGeneratedAppletWidget(
                        user,
                        id,
                        html,
                        applet.updatedAt,
                    );
                // Manual regeneration returns an editable preview. Saving remains explicit.
                const current = await loadAppletForWidgetGeneration(user, id);
                if (String(current.updatedAt) !== String(applet.updatedAt)) {
                    throw Object.assign(new Error("Applet changed"), {
                        code: "WIDGET_SOURCE_CHANGED",
                    });
                }
                return ensureAppletRuntimeHtml(html, { appletId: id });
            },
        });
        return json(
            result,
            result.status === "queued" || result.status === "running"
                ? 202
                : 200,
        );
    } catch (error) {
        console.error("Home widget request failed", {
            status: error?.status || 503,
            errorType: error?.name,
            location: error?.stack?.split("\n")[1],
        });
        return json(
            { status: "failed", code: "WIDGET_UNAVAILABLE" },
            error?.status || 503,
        );
    }
}
