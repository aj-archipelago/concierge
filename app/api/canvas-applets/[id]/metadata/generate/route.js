import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "../../../../utils/auth";
import { generateAppletMetadata } from "../../../registry";
import { getClient } from "../../../../../../src/graphql";
import { buildWorkspacePromptVariables } from "../../../../utils/llm-file-utils.js";
import { executeRunWorkspacePrompt } from "../../../../utils/run-workspace-prompt.js";

const METADATA_SYSTEM_PROMPT = `You generate concise applet directory metadata for Concierge.

Return only valid JSON with this exact shape:
{
  "name": "short app name",
  "slug": "url-safe-kebab-case-slug",
  "description": "one polished sentence, 80-220 characters",
  "icon": "Lucide icon component name",
  "badgeLabel": "2-4 word card badge",
  "category": "single lowercase category",
  "tags": ["lowercase", "searchable", "tags"],
  "imageAlt": "short accessible image description",
  "imagePrompt": "image generation prompt for the applet card art"
}

Keep publishing state out of the metadata. Do not mention app stores, drafts, saved versions, or implementation details unless they describe the app's purpose.`;

function extractJsonCandidate(value) {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return (fence?.[1] || trimmed).trim();
}

function parseJsonObject(value) {
    if (!value) return null;
    try {
        const parsed =
            typeof value === "string"
                ? JSON.parse(extractJsonCandidate(value))
                : value;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : null;
    } catch {
        return null;
    }
}

function mergeMetadata(seed, generated) {
    if (!generated) return seed;
    return {
        ...seed,
        ...Object.fromEntries(
            Object.entries(generated).filter(([, value]) => {
                if (Array.isArray(value)) return value.length > 0;
                return value !== undefined && value !== null && value !== "";
            }),
        ),
        tags: Array.isArray(generated.tags) ? generated.tags : seed.tags,
        metadataGeneratedAt: new Date().toISOString(),
    };
}

async function generateMetadataWithCortex({ seed, appletId, user }) {
    const variables = await buildWorkspacePromptVariables({
        systemPrompt: METADATA_SYSTEM_PROMPT,
        prompt: `Create applet card metadata from this seed. Preserve facts, improve naming and searchability, and produce a strong imagePrompt for directory-card artwork.\n\n${JSON.stringify(seed, null, 2)}`,
        appletId,
        userContextId: user?.contextId || null,
        userContextKey: user?.contextKey || null,
        includeUserGlobal: true,
    });

    const { response } = await executeRunWorkspacePrompt({
        graphqlClient: getClient(),
        variables,
        fetchPolicy: "no-cache",
    });
    return parseJsonObject(response?.data?.run_workspace_prompt?.result);
}

function jsonError(error, fallback = "Internal server error") {
    return NextResponse.json(
        { error: error?.message || fallback },
        { status: error?.status || 500 },
    );
}

function validateAppletId(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        const error = new Error("Invalid applet ID");
        error.status = 400;
        throw error;
    }
}

async function requireUser() {
    const user = await getCurrentUser();
    if (!user?._id) {
        const error = new Error("Unauthorized");
        error.status = 401;
        throw error;
    }
    return user;
}

export async function POST(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        validateAppletId(id);
        const user = await requireUser();
        const fallback = await generateAppletMetadata(user, id);
        let generated = null;
        let source = "heuristic";

        try {
            generated = await generateMetadataWithCortex({
                seed: fallback.metadata,
                appletId: id,
                user,
            });
            if (generated) {
                source = "cortex";
            }
        } catch (error) {
            console.warn(
                "Applet metadata Cortex generation failed; using heuristic fallback:",
                error?.message || error,
            );
        }

        return NextResponse.json({
            metadata: mergeMetadata(fallback.metadata, generated),
            source,
        });
    } catch (error) {
        console.error("Error generating applet metadata:", error);
        return jsonError(error);
    }
}
