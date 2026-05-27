import AppletSharedFile from "../models/applet-shared-file.js";
import Prompt from "../models/prompt.js";

function normalizeId(value) {
    if (!value) {
        return null;
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value.toString === "function") {
        return value.toString();
    }
    return String(value);
}

function appendIds(targetSet, values = []) {
    for (const value of values) {
        const normalized = normalizeId(value);
        if (normalized) {
            targetSet.add(normalized);
        }
    }
}

async function loadWorkspacePromptEntries(workspace) {
    const promptEntries = Array.isArray(workspace?.prompts)
        ? workspace.prompts.filter(Boolean)
        : [];

    if (promptEntries.length === 0) {
        return [];
    }

    const promptsArePopulated = promptEntries.every(
        (prompt) => prompt && Array.isArray(prompt.files),
    );
    if (promptsArePopulated) {
        return promptEntries;
    }

    const promptIds = promptEntries.map(normalizeId).filter(Boolean);
    if (promptIds.length === 0) {
        return [];
    }

    return Prompt.find({
        _id: {
            $in: promptIds,
        },
    }).select("files");
}

export async function collectLegacyAppletSharedFileIds(workspace) {
    const fileIds = new Set();

    appendIds(fileIds, workspace?.files);

    const prompts = await loadWorkspacePromptEntries(workspace);
    for (const prompt of prompts) {
        appendIds(fileIds, prompt?.files);
    }

    return Array.from(fileIds);
}

export async function ensureAppletSharedFileStore(
    workspace,
    { match = null, populateFiles = true } = {},
) {
    if (!workspace?.applet) {
        return null;
    }

    const fileIds = await collectLegacyAppletSharedFileIds(workspace);

    if (fileIds.length > 0) {
        await AppletSharedFile.findOneAndUpdate(
            { appletId: workspace.applet },
            {
                $addToSet: {
                    files: {
                        $each: fileIds,
                    },
                },
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
            },
        );
    }

    const query = AppletSharedFile.findOne({
        appletId: workspace.applet,
    });

    if (!populateFiles) {
        return query;
    }

    if (match) {
        return query.populate({ path: "files", match });
    }

    return query.populate("files");
}
