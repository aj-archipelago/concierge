import { NextResponse } from "next/server";
import { getClient, QUERIES } from "../../utils/cortex-client.js";
import { getCurrentUser, handleError } from "../../utils/auth";
import { buildWorkspacePromptVariables } from "../../utils/llm-file-utils";
import config from "../../../../config";

const PATHWAY = "run_workspace_prompt";

const SYSTEM_PROMPT = `You classify a user's freeform request for something to add to their Concierge home dashboard.

Return a JSON object with this exact shape:
{
  "kind": "applet" | "automation",
  "reason": string (one short sentence, max 120 chars)
}

Definitions:
- "applet": an interactive tool the user opens and uses themselves — dashboards, forms, trackers, editors, calculators, translators, or anything they launch on demand.
- "automation": a scheduled or recurring report/job that runs for the user and posts results — digests, briefs, monitoring, summaries that refresh on a schedule, inbox/email sweeps, "every morning" / "weekly" updates.

Rules:
- Prefer "automation" when the request mentions a schedule, frequency, "every", "daily", "weekly", "monitor", "alert me", "brief", "digest", or "keep me updated".
- Prefer "applet" when the user wants something to open, use, edit, explore, or interact with.
- If ambiguous, prefer "applet".
- Do not include any text before or after the JSON. No markdown code fences.`;

function extractJson(text) {
    if (!text) return null;
    const trimmed = String(text).trim();

    try {
        return JSON.parse(trimmed);
    } catch {
        // fall through
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
        try {
            return JSON.parse(fenced[1].trim());
        } catch {
            // fall through
        }
    }

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

function heuristicKind(prompt) {
    const text = String(prompt || "").toLowerCase();
    if (
        /\b(every|daily|weekly|hourly|schedule|scheduled|digest|brief|monitor|alert|remind|weekday|morning|evening)\b/.test(
            text,
        )
    ) {
        return "automation";
    }
    return "applet";
}

function normalizeClassification(raw, prompt) {
    const kind =
        raw?.kind === "automation" || raw?.kind === "applet"
            ? raw.kind
            : heuristicKind(prompt);
    const reason =
        typeof raw?.reason === "string" && raw.reason.trim()
            ? raw.reason.trim().slice(0, 120)
            : kind === "automation"
              ? "Looks like a scheduled report."
              : "Looks like an interactive tool.";
    return { kind, reason };
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

        let classification = null;
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
            classification = normalizeClassification(
                extractJson(result),
                prompt,
            );
        } catch (err) {
            console.warn(
                "[home.classify-add] cortex call failed:",
                err?.message || err,
            );
            classification = normalizeClassification(null, prompt);
        }

        return NextResponse.json({ classification });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
