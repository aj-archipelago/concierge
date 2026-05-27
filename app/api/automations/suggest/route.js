import { NextResponse } from "next/server";
import { getClient, QUERIES } from "../../../../src/graphql";
import { getCurrentUser, handleError } from "../../utils/auth";
import { buildWorkspacePromptVariables } from "../../utils/llm-file-utils";
import config from "../../../../config";

const PATHWAY = "run_workspace_prompt";

const ALLOWED_PRESETS = new Set([
    "manual",
    "hourly",
    "daily-morning",
    "weekday-mornings",
    "weekly-monday",
]);

const SYSTEM_PROMPT = `You help users create scheduled "automations" — short, focused tasks that an AI assistant runs on a schedule (e.g. "summarize unread emails every weekday at 8am").

Given the user's freeform description, return a JSON object with this exact shape:
{
  "name": string (max 60 chars, Title Case, no emoji, no quotes),
  "description": string (one sentence, max 140 chars),
  "schedulePreset": one of "manual" | "hourly" | "daily-morning" | "weekday-mornings" | "weekly-monday",
  "producesHtml": boolean,
  "contentMarkdown": string (the full instructions the assistant should follow when running this automation, in Markdown, starting with a top-level heading; expand the user's description into clear, actionable steps)
}

Rules:
- Pick the preset that best matches any time hints in the prompt. If none, use "manual".
- "producesHtml" is true only when the user explicitly asks for a report, dashboard, brief, or rendered HTML output.
- Do not include any text before or after the JSON. No markdown code fences.`;

function extractJson(text) {
    if (!text) return null;
    const trimmed = String(text).trim();

    // Try direct parse first.
    try {
        return JSON.parse(trimmed);
    } catch {
        // fall through
    }

    // Strip a ```json fence if present.
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
        try {
            return JSON.parse(fenced[1].trim());
        } catch {
            // fall through
        }
    }

    // Find the first balanced {...} in the text.
    const start = trimmed.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < trimmed.length; i += 1) {
        const ch = trimmed[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === "\\") {
            escaped = inString;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (ch === "{") depth += 1;
        else if (ch === "}") {
            depth -= 1;
            if (depth === 0) {
                try {
                    return JSON.parse(trimmed.slice(start, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

function clampString(value, max) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function normalizeSuggestion(raw, fallbackPrompt) {
    if (!raw || typeof raw !== "object") return null;
    const presetCandidate =
        typeof raw.schedulePreset === "string" ? raw.schedulePreset.trim() : "";
    const schedulePreset = ALLOWED_PRESETS.has(presetCandidate)
        ? presetCandidate
        : "manual";

    const name = clampString(raw.name, 60) || clampString(fallbackPrompt, 60);
    if (!name) return null;

    return {
        name,
        description: clampString(raw.description, 140),
        schedulePreset,
        producesHtml: Boolean(raw.producesHtml),
        contentMarkdown:
            typeof raw.contentMarkdown === "string" &&
            raw.contentMarkdown.trim()
                ? raw.contentMarkdown
                : `# ${name}\n\n${fallbackPrompt}\n`,
    };
}

export async function POST(request) {
    try {
        const user = await getCurrentUser();
        const body = await request.json().catch(() => ({}));
        const prompt = String(body?.prompt || "").trim();

        if (!prompt) {
            return NextResponse.json(
                { error: "prompt is required" },
                { status: 400 },
            );
        }

        let suggestion = null;
        try {
            const variables = await buildWorkspacePromptVariables({
                systemPrompt: SYSTEM_PROMPT,
                text: prompt,
                userContextId: user.contextId || null,
                userContextKey: user.contextKey || null,
            });
            variables.model = config.cortex.defaultChatModel;

            const query = QUERIES.getWorkspacePromptQuery(PATHWAY);
            const response = await getClient().query({ query, variables });
            const result = response?.data?.[PATHWAY]?.result || "";
            suggestion = normalizeSuggestion(extractJson(result), prompt);
        } catch (err) {
            // Suggestion is best-effort. If Cortex fails, the dialog falls
            // back to the user-typed prompt and default schedule.
            console.warn(
                "[automations.suggest] cortex call failed:",
                err?.message || err,
            );
        }

        return NextResponse.json({ suggestion });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
