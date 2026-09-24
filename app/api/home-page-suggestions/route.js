import { NextResponse } from "next/server";
import { getClient } from "../utils/cortex-client.js";
import { getCurrentUser } from "../utils/auth";
import { buildWorkspacePromptVariables } from "../utils/llm-file-utils.js";
import { executeRunWorkspacePrompt } from "../utils/run-workspace-prompt.js";
import { listAppletRegistry } from "../canvas-applets/registry";

// Concise summary of what a Concierge home page can actually do, so the model
// only suggests ideas achievable with the agent's real capabilities.
const CONCIERGE_CAPABILITIES = `A Concierge home page is an interactive tool that runs inside Concierge and can call its AI agent. Through the agent it can: hold multi-turn conversations; search the web and return cited answers; summarise and extract from documents, articles, and transcripts; translate between languages; transcribe audio and video; generate and edit images, video, music, and speech; analyse images and uploaded files; write and edit long-form content; run code and lightweight data analysis; call the user's connected tools and data sources; read and write the user's files; and surface results from scheduled automations. Home pages render as interactive dashboards, forms, feeds, and tools.`;

const SYSTEM_PROMPT = `You generate concise home page ideas for Concierge, a configurable AI workspace.

${CONCIERGE_CAPABILITIES}

Return only a valid JSON array of exactly 4 strings. Each string is a short, specific home page description (8–12 words).

Tailor suggestions to the user's stated work, interests, and available tools. Consider the user's existing applets as hints about their role and interests.

Rules:
- Return ONLY a JSON array, no markdown, no explanation.
- Only suggest ideas that are realistically achievable with the capabilities described above.
- Each suggestion must be distinct and actionable.
- Be specific and vivid, not generic (e.g. not just "news dashboard").
- Examples of good style: "Breaking news tracker with live updates and source highlights", "Daily briefing with top stories, weather, and my schedule"`;

function extractSuggestions(raw) {
    if (!raw) return null;
    const candidate = raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    try {
        const parsed = JSON.parse(candidate);
        if (
            Array.isArray(parsed) &&
            parsed.every((s) => typeof s === "string")
        ) {
            return parsed.slice(0, 4);
        }
    } catch {
        // ignore
    }
    return null;
}

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user?._id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        let appletContext = "";
        try {
            const { applets } = await listAppletRegistry(user);
            const names = (applets || [])
                .filter((a) => a.version === 2)
                .slice(0, 10)
                .map((a) => a.name)
                .filter(Boolean);
            if (names.length > 0) {
                appletContext = `\n\nThe user already has these applets: ${names.join(", ")}.`;
            }
        } catch {
            // non-fatal
        }

        const variables = await buildWorkspacePromptVariables({
            systemPrompt: SYSTEM_PROMPT,
            prompt: `Generate 4 home page suggestions for this user.${appletContext}`,
            includeUserGlobal: true,
            userContextId: user?.contextId || null,
            userContextKey: user?.contextKey || null,
        });

        const { response } = await executeRunWorkspacePrompt({
            graphqlClient: getClient(),
            variables,
            fetchPolicy: "no-cache",
        });

        const raw = response?.data?.run_workspace_prompt?.result;
        const suggestions = extractSuggestions(raw);

        if (!suggestions) {
            return NextResponse.json(
                { error: "Failed to parse suggestions" },
                { status: 500 },
            );
        }

        return NextResponse.json({ suggestions });
    } catch (error) {
        console.error("Error generating home page suggestions:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
