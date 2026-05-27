import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../utils/auth";
import Automation from "../../models/automation";
import Digest from "../../models/digest.mjs";
import {
    automationEffectiveEnabled,
    calculateNextRunAt,
    deleteAutomationFolder,
    findAutomationForUser,
    listAutomationSupportingFiles,
    normalizeSchedule,
    readAutomationContent,
    serializeAutomation,
    writeAutomationContent,
} from "../utils";

async function findHomeWidget(ownerId, automationId) {
    const digest = await Digest.findOne({ owner: ownerId });
    if (!digest) return { digest: null, block: null };
    const block = digest.blocks.find(
        (b) => String(b.automationId || "") === String(automationId),
    );
    return { digest, block: block || null };
}

async function setHomeWidget(ownerId, automation, pinned) {
    // CSFLE rejects $push on the encrypted blocks array, so we always
    // replace the full array via $set with a freshly-built list.
    const existing = (await Digest.findOne({ owner: ownerId }).lean()) || {
        owner: ownerId,
        blocks: [],
    };
    const automationKey = String(automation._id);
    const hasBlock = (existing.blocks || []).some(
        (b) => String(b.automationId || "") === automationKey,
    );

    if (pinned && hasBlock) return;
    if (!pinned && !hasBlock) return;

    let nextBlocks;
    if (pinned) {
        nextBlocks = [
            ...(existing.blocks || []),
            {
                title: automation.name || "Automation",
                automationId: automation._id,
            },
        ];
    } else {
        nextBlocks = (existing.blocks || []).filter(
            (b) => String(b.automationId || "") !== automationKey,
        );
    }

    await Digest.findOneAndUpdate(
        { owner: ownerId },
        { $set: { owner: ownerId, blocks: nextBlocks } },
        { upsert: true, new: true },
    );
}

export async function GET(request, { params }) {
    try {
        const user = await getCurrentUser();
        const automation = await findAutomationForUser(params.id, user._id);

        if (!automation) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        }

        const [content, files, homeWidget] = await Promise.all([
            readAutomationContent(user.contextId, automation.slug),
            listAutomationSupportingFiles(user.contextId, automation.slug),
            findHomeWidget(user._id, automation._id),
        ]);

        return NextResponse.json(
            serializeAutomation(automation, {
                content,
                files,
                pinnedToHome: Boolean(homeWidget.block),
            }),
        );
    } catch (error) {
        return handleError(error);
    }
}

export async function PUT(request, { params }) {
    try {
        const user = await getCurrentUser();
        const automation = await findAutomationForUser(params.id, user._id);

        if (!automation) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        }

        const body = await request.json();

        if (body.name !== undefined) {
            automation.name = String(body.name || "").trim();
        }
        if (body.description !== undefined) {
            automation.set(
                "description",
                String(body.description || "").trim(),
            );
        }
        if (body.schedule !== undefined) {
            automation.schedule = normalizeSchedule(body.schedule);
        }
        if (body.timezone !== undefined) {
            automation.timezone = body.timezone || "UTC";
        }
        if (body.enabled !== undefined) {
            automation.enabled = Boolean(body.enabled);
        }
        if (body.inputs !== undefined) {
            automation.inputs = body.inputs || null;
        }
        if (body.producesHtml !== undefined) {
            automation.producesHtml = Boolean(body.producesHtml);
            if (!automation.producesHtml) {
                automation.pinnedToSidebar = false;
            }
        }
        if (body.pinnedToSidebar !== undefined) {
            automation.pinnedToSidebar =
                automation.producesHtml && Boolean(body.pinnedToSidebar);
        }

        automation.enabled = automationEffectiveEnabled(
            automation.enabled,
            automation.schedule,
        );

        automation.nextRunAt = automation.enabled
            ? calculateNextRunAt(automation.schedule, automation.timezone)
            : null;

        if (!automation.name) {
            return NextResponse.json(
                { error: "Automation name is required" },
                { status: 400 },
            );
        }

        let savedContent;
        if (body.content !== undefined) {
            savedContent = String(body.content || "");
            const uploadResult = await writeAutomationContent(
                user.contextId,
                automation.slug,
                savedContent,
            );
            if (uploadResult.error) {
                return NextResponse.json(
                    { error: "Failed to update automation content" },
                    { status: 500 },
                );
            }
        }

        await automation.save();

        if (body.pinnedToHome !== undefined) {
            await setHomeWidget(
                user._id,
                automation,
                Boolean(body.pinnedToHome),
            );
        }

        const { block: homeBlock } = await findHomeWidget(
            user._id,
            automation._id,
        );

        return NextResponse.json(
            serializeAutomation(automation, {
                ...(savedContent !== undefined
                    ? { content: savedContent }
                    : {}),
                pinnedToHome: Boolean(homeBlock),
            }),
        );
    } catch (error) {
        return handleError(error);
    }
}

export async function DELETE(request, { params }) {
    try {
        const user = await getCurrentUser();
        const existing = await findAutomationForUser(params.id, user._id);

        if (!existing) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        }

        await Automation.findOneAndDelete({
            _id: existing._id,
            owner: user._id,
        });

        // Drop any home widget that pointed at the now-deleted automation.
        // Use $set with the full array; CSFLE blocks $push/$pull on the
        // encrypted blocks array.
        const digest = await Digest.findOne({ owner: user._id }).lean();
        if (digest) {
            const next = (digest.blocks || []).filter(
                (b) => String(b.automationId || "") !== String(existing._id),
            );
            if (next.length !== (digest.blocks || []).length) {
                await Digest.findOneAndUpdate(
                    { owner: user._id },
                    { $set: { blocks: next } },
                );
            }
        }

        await deleteAutomationFolder(user.contextId, existing.slug);

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
