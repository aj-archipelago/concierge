import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../../utils/auth";
import { parseStreamingMultipart } from "../../../utils/upload-utils";
import {
    uploadBufferToMediaService,
    deleteMediaFile,
    listSkillFiles,
} from "../../../utils/media-service-utils";
import { createSkillStorageTarget } from "../../../../../src/utils/storageTargets";
import Skill from "../../../models/skill";

const SKILL_MD = "SKILL.md";

function sanitizeFilename(raw) {
    const basename = raw?.split(/[/\\]/).pop();
    if (!basename || basename === "." || basename === "..") return null;
    return basename;
}

async function getSkillForUser(name, userId) {
    return Skill.findOne({ userId, name: name.toLowerCase() });
}

// POST: upload a file for a skill
export async function POST(request, { params }) {
    const { name } = params;

    try {
        const currentUser = await getCurrentUser();
        const skill = await getSkillForUser(name, currentUser.userId);

        if (!skill) {
            return NextResponse.json(
                { error: "Skill not found" },
                { status: 404 },
            );
        }

        const result = await parseStreamingMultipart(request, currentUser);
        if (result.error) {
            return result.error;
        }

        const { fileBuffer, metadata } = result.data;

        // Normalize to basename and reject path traversal
        const safeName = sanitizeFilename(metadata.filename);
        if (!safeName) {
            return NextResponse.json(
                { error: "Invalid filename" },
                { status: 400 },
            );
        }
        metadata.filename = safeName;

        // Reject uploads named SKILL.md — that's the reserved content file
        if (safeName.toLowerCase() === SKILL_MD.toLowerCase()) {
            return NextResponse.json(
                {
                    error: "Cannot upload a file named SKILL.md. Use the skill content editor instead.",
                },
                { status: 400 },
            );
        }

        const skillName = name.toLowerCase();
        const storageTarget = createSkillStorageTarget(currentUser.contextId);

        const uploadResult = await uploadBufferToMediaService(
            fileBuffer,
            metadata,
            { storageTarget, subPath: skillName },
        );

        if (uploadResult.error) {
            return uploadResult.error;
        }

        // Return updated file list (includes SKILL.md so UI can show metadata)
        const files = await listSkillFiles(currentUser.contextId, skillName);

        return NextResponse.json({ success: true, files });
    } catch (error) {
        return handleError(error);
    }
}

// GET: list files for a skill
export async function GET(request, { params }) {
    const { name } = params;

    try {
        const user = await getCurrentUser();
        const skill = await getSkillForUser(name, user.userId);

        if (!skill) {
            return NextResponse.json(
                { error: "Skill not found" },
                { status: 404 },
            );
        }

        const skillName = name.toLowerCase();
        const allFiles = await listSkillFiles(user.contextId, skillName);

        return NextResponse.json({ files: allFiles });
    } catch (error) {
        return handleError(error);
    }
}

// DELETE: remove a file from a skill
export async function DELETE(request, { params }) {
    const { name } = params;
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");

    try {
        const user = await getCurrentUser();
        const skill = await getSkillForUser(name, user.userId);

        if (!skill) {
            return NextResponse.json(
                { error: "Skill not found" },
                { status: 404 },
            );
        }

        const safeName = sanitizeFilename(filename);
        if (!safeName) {
            return NextResponse.json(
                { error: "Filename is required" },
                { status: 400 },
            );
        }

        if (safeName.toLowerCase() === SKILL_MD.toLowerCase()) {
            return NextResponse.json(
                {
                    error: "Cannot delete SKILL.md. Delete the entire skill instead.",
                },
                { status: 400 },
            );
        }

        const skillName = name.toLowerCase();
        const storageTarget = createSkillStorageTarget(user.contextId);
        const blobPath = `skills/${skillName}/${safeName}`;

        await deleteMediaFile({ blobPath, storageTarget });

        // Return updated file list (includes SKILL.md so UI can show metadata)
        const files = await listSkillFiles(user.contextId, skillName);

        return NextResponse.json({ success: true, files });
    } catch (error) {
        return handleError(error);
    }
}
