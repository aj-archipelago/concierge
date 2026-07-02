import { NextResponse } from "next/server";
import { getClient, QUERIES } from "../../../../../src/graphql";
import { getCurrentUser } from "../../../utils/auth.js";
import { validateAppletAccess } from "../../access.js";
import { APPLET_SDK_LIMITS, withAppletSdkGuard } from "../../sdk-guard.js";

function normalizeLanguage(language) {
    return String(language || "")
        .toLowerCase()
        .startsWith("ar")
        ? "ar"
        : "en";
}

function parseJsonObject(value) {
    if (!value) return {};
    if (typeof value === "object" && !Array.isArray(value)) return value;
    if (typeof value !== "string") return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    } catch {
        return {};
    }
}

export async function POST(request) {
    try {
        const { appletId, language, prewarmAnswers } = await request.json();

        if (!appletId || typeof appletId !== "string") {
            return NextResponse.json(
                { error: "appletId is required" },
                { status: 400 },
            );
        }

        const user = await getCurrentUser();
        const accessError = await validateAppletAccess(appletId, user);
        if (accessError) {
            return accessError;
        }

        return await withAppletSdkGuard({
            appletId,
            userId: user?._id,
            api: "sourceQa.initialQuestions",
            limits: APPLET_SDK_LIMITS.sourceQa,
            run: async () => {
                const graphqlClient = getClient();
                const response = await graphqlClient.query({
                    query: QUERIES.SOURCE_QA_INITIAL_QUESTIONS,
                    variables: {
                        language: normalizeLanguage(language),
                        prewarmAnswers: prewarmAnswers !== false,
                    },
                    fetchPolicy: "network-only",
                });

                const data = response.data?.ask_aj_initial_questions;
                const payload = parseJsonObject(data?.result);

                return NextResponse.json({
                    ...payload,
                    warnings: data?.warnings || [],
                    errors: data?.errors || [],
                });
            },
        });
    } catch (error) {
        console.error("Error in applet source Q&A initial questions:", error);
        return NextResponse.json(
            { error: "Failed to generate source Q&A initial questions" },
            { status: 500 },
        );
    }
}
