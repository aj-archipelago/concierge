import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../utils/auth";
import Skill from "../models/skill";
import {
    uploadBufferToMediaService,
    hashBuffer,
} from "../utils/media-service-utils";
import { createSkillStorageTarget } from "../../../src/utils/storageTargets";
import {
    splitSkillSummaryDescription,
    mergeSkillDescriptionOverflowIntoMarkdown,
} from "../../../src/utils/skillDescriptionLimits";

// GET: list all skills for the current user
export async function GET() {
    try {
        const user = await getCurrentUser();
        const skills = await Skill.find({ userId: user.userId })
            .select("name description path updatedAt")
            .lean();
        skills.sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json({ skills });
    } catch (error) {
        return handleError(error);
    }
}

// POST: create a new skill
export async function POST(request) {
    try {
        const user = await getCurrentUser();
        const { name, description, content } = await request.json();

        const { summary, overflow } = splitSkillSummaryDescription(description);

        if (
            !name ||
            !summary ||
            typeof content !== "string" ||
            !String(content).trim()
        ) {
            return NextResponse.json(
                {
                    error: "name, a non-empty description, and SKILL.md content are required",
                },
                { status: 400 },
            );
        }

        if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || name.length > 64) {
            return NextResponse.json(
                {
                    error: "Name must be lowercase alphanumeric with hyphens, max 64 characters",
                },
                { status: 400 },
            );
        }

        const skillName = name.toLowerCase();
        const skillPath = `skills/${skillName}`;

        let skillMarkdownBody = content;
        if (overflow) {
            skillMarkdownBody = mergeSkillDescriptionOverflowIntoMarkdown(
                overflow,
                skillMarkdownBody,
            );
        }

        // Upsert DB record first so validation errors don't leave orphaned blobs
        const skill = await Skill.findOneAndUpdate(
            { userId: user.userId, name: skillName },
            {
                userId: user.userId,
                name: skillName,
                description: summary,
                path: skillPath,
            },
            { upsert: true, new: true, runValidators: true },
        );

        // Upload SKILL.md to blob storage
        const buffer = Buffer.from(skillMarkdownBody, "utf-8");
        const hash = await hashBuffer(buffer);
        const storageTarget = createSkillStorageTarget(user.contextId);

        const uploadResult = await uploadBufferToMediaService(
            buffer,
            { filename: "SKILL.md", mimeType: "text/markdown", hash },
            { storageTarget, subPath: skillName },
        );

        if (uploadResult.error) {
            await Skill.deleteOne({ _id: skill._id }).catch(() => {});
            return NextResponse.json(
                { error: "Failed to save skill content" },
                { status: 500 },
            );
        }

        return NextResponse.json(skill, { status: 201 });
    } catch (error) {
        return handleError(error);
    }
}
