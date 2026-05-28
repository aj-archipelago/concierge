import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../utils/auth";
import Skill from "../../models/skill";
import {
    deleteMediaFile,
    uploadBufferToMediaService,
    hashBuffer,
    readBlobContent,
    listSkillFiles,
} from "../../utils/media-service-utils";
import { createSkillStorageTarget } from "../../../../src/utils/storageTargets";
import {
    splitSkillSummaryDescription,
    mergeSkillDescriptionOverflowIntoMarkdown,
} from "../../../../src/utils/skillDescriptionLimits";

const SKILL_MD = "SKILL.md";

// GET: fetch a single skill by name
export async function GET(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser();
        const { name } = params;

        const skill = await Skill.findOne({
            userId: user.userId,
            name: name.toLowerCase(),
        }).lean();

        if (!skill) {
            return NextResponse.json(
                { error: "Skill not found" },
                { status: 404 },
            );
        }

        const storageTarget = createSkillStorageTarget(user.contextId);
        const skillName = name.toLowerCase();

        // Read SKILL.md content from blob storage
        const content = await readBlobContent(
            `skills/${skillName}/${SKILL_MD}`,
            storageTarget,
        );

        // List all files in the skill directory
        const allFiles = await listSkillFiles(user.contextId, skillName);

        // Separate SKILL.md from supporting files
        const files = allFiles.filter(
            (f) => !f.name?.endsWith(`/${SKILL_MD}`) && f.filename !== SKILL_MD,
        );

        return NextResponse.json({
            ...skill,
            content: content || "",
            files,
        });
    } catch (error) {
        return handleError(error);
    }
}

// PUT: update a skill
export async function PUT(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser();
        const { name } = params;
        const body = await request.json();
        const skillName = name.toLowerCase();

        // Block renames
        if (body.name !== undefined && body.name.toLowerCase() !== skillName) {
            return NextResponse.json(
                {
                    error: "Renaming skills is not supported. Delete and recreate instead.",
                },
                { status: 400 },
            );
        }

        const skill = await Skill.findOne({
            userId: user.userId,
            name: skillName,
        });

        if (!skill) {
            return NextResponse.json(
                { error: "Skill not found" },
                { status: 404 },
            );
        }

        const storageTarget = createSkillStorageTarget(user.contextId);

        let contentToUpload =
            body.content !== undefined ? body.content : undefined;

        if (body.description !== undefined) {
            const { summary, overflow } = splitSkillSummaryDescription(
                body.description,
            );
            skill.description = summary;

            if (overflow) {
                const existingMarkdown =
                    contentToUpload !== undefined
                        ? contentToUpload
                        : ((await readBlobContent(
                              `skills/${skillName}/${SKILL_MD}`,
                              storageTarget,
                          )) ?? "");
                contentToUpload = mergeSkillDescriptionOverflowIntoMarkdown(
                    overflow,
                    existingMarkdown,
                );
            }
        }

        // Validate the model before touching blob storage so a bad description
        // doesn't leave SKILL.md updated while MongoDB stays on the old value.
        if (body.description !== undefined || contentToUpload !== undefined) {
            skill.updatedAt = new Date();
            try {
                await skill.validate();
            } catch (validationError) {
                return NextResponse.json(
                    { error: validationError.message },
                    { status: 400 },
                );
            }
        }

        if (contentToUpload !== undefined) {
            const buffer = Buffer.from(contentToUpload, "utf-8");
            const hash = await hashBuffer(buffer);

            const uploadResult = await uploadBufferToMediaService(
                buffer,
                { filename: SKILL_MD, mimeType: "text/markdown", hash },
                { storageTarget, subPath: skillName },
            );

            if (uploadResult.error) {
                return NextResponse.json(
                    { error: "Failed to update skill content" },
                    { status: 500 },
                );
            }
        }

        if (body.description !== undefined || contentToUpload !== undefined) {
            await skill.save();
        }

        return NextResponse.json(skill);
    } catch (error) {
        return handleError(error);
    }
}

// DELETE: remove a skill
export async function DELETE(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser();
        const { name } = params;
        const skillName = name.toLowerCase();

        const skill = await Skill.findOneAndDelete({
            userId: user.userId,
            name: skillName,
        });

        if (!skill) {
            return NextResponse.json(
                { error: "Skill not found" },
                { status: 404 },
            );
        }

        // Delete all files in the skill directory from blob storage
        const storageTarget = createSkillStorageTarget(user.contextId);
        const files = await listSkillFiles(user.contextId, skillName);

        for (const file of files) {
            if (file.name) {
                await deleteMediaFile({
                    blobPath: file.name,
                    storageTarget,
                }).catch(() => {});
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleError(error);
    }
}
