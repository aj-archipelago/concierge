import { updateDigestBlocks } from "../../utils/digest-store.mjs";
import { requireColleague, validateTaskWatch } from "../../utils/colleagues.js";
import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../utils/auth";
import Automation from "../../models/automation";
import {
    isValidRetainedRunLimit,
    retainedRunLimit,
} from "../../../../src/utils/taskOutputRetention.js";
import Digest from "../../models/digest.mjs";
import { deleteEntityShare } from "../../utils/shareHelpers";
import {
    automationEffectiveEnabled,
    calculateNextRunAt,
    deleteAutomationFolder,
    findAutomationForEditor,
    findAutomationForUser,
    findAutomationForViewer,
    listAutomationSupportingFiles,
    normalizeSchedule,
    readAutomationContent,
    resolveAutomationStorageContextId,
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
    if (pinned && !(await Digest.findOne({ owner: ownerId }))) {
        await Digest.findOneAndUpdate(
            { _id: ownerId, owner: ownerId },
            { $setOnInsert: { owner: ownerId, blocks: [] } },
            { upsert: true },
        );
    }
    const key = String(automation._id);
    await updateDigestBlocks(ownerId, (blocks) => {
        const hasBlock = blocks.some(
            (b) => String(b.automationId || "") === key,
        );
        if (pinned === hasBlock) return null;
        return pinned
            ? [
                  ...blocks,
                  {
                      title: automation.name || "Automation",
                      automationId: automation._id,
                  },
              ]
            : blocks.filter((b) => String(b.automationId || "") !== key);
    });
}

export async function GET(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser();
        const found = await findAutomationForViewer(params.id, user._id);

        if (!found) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        }

        const { automation, isOwner, role } = found;

        // Automation files are stored under the owner's contextId, so viewers
        // need to read from the owner's storage, not their own.
        const ownerContextId = await resolveAutomationStorageContextId(
            automation,
            user,
            isOwner,
        );

        const [content, files, homeWidget] = await Promise.all([
            ownerContextId
                ? readAutomationContent(ownerContextId, automation.slug)
                : Promise.resolve(""),
            ownerContextId
                ? listAutomationSupportingFiles(ownerContextId, automation.slug)
                : Promise.resolve([]),
            isOwner
                ? findHomeWidget(user._id, automation._id)
                : Promise.resolve({ block: null }),
        ]);

        return NextResponse.json(
            serializeAutomation(automation, {
                content,
                files,
                pinnedToHome: Boolean(homeWidget.block),
                isOwner,
                shareRole: role,
                readOnly: !isOwner && role !== "editor",
            }),
        );
    } catch (error) {
        return handleError(error);
    }
}

export async function PUT(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser();
        const found = await findAutomationForEditor(params.id, user._id);

        if (!found) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        }

        const { automation, isOwner, role } = found;
        const storageContextId = await resolveAutomationStorageContextId(
            automation,
            user,
            isOwner,
        );
        if (!storageContextId) {
            return NextResponse.json(
                { error: "Automation storage is unavailable" },
                { status: 500 },
            );
        }

        const body = await request.json();
        if (body.retainedRuns !== undefined) {
            if (!isValidRetainedRunLimit(body.retainedRuns)) {
                return NextResponse.json(
                    {
                        error: "Retained runs must be an integer from 0 to 1000",
                    },
                    { status: 400 },
                );
            }
            if (
                !isOwner &&
                body.retainedRuns !== retainedRunLimit(automation.retainedRuns)
            ) {
                return NextResponse.json(
                    { error: "Only the owner can change output retention" },
                    { status: 403 },
                );
            }
            automation.retainedRuns = body.retainedRuns;
        }
        if (body.entityId !== undefined) {
            if (!isOwner && body.entityId !== automation.entityId)
                return NextResponse.json(
                    { error: "Only the owner can assign a colleague" },
                    { status: 403 },
                );
            if (isOwner)
                automation.entityId = body.entityId
                    ? (
                          await requireColleague(user, body.entityId, {
                              watch:
                                  (body.schedule || automation.schedule)
                                      ?.frequency === "files",
                          })
                      ).id
                    : null;
        }
        const previousWatchPath = automation.schedule?.watchPath;

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
        }
        // Sidebar pinning was removed; keep the field cleared for existing docs.
        automation.pinnedToSidebar = false;

        automation.enabled = automationEffectiveEnabled(
            automation.enabled,
            automation.schedule,
        );

        validateTaskWatch(automation.schedule, automation.entityId);
        if (automation.schedule?.frequency === "files" && automation.entityId)
            await requireColleague(
                { contextId: storageContextId },
                automation.entityId,
                { watch: true },
            );
        if (previousWatchPath !== automation.schedule?.watchPath)
            automation.watchFingerprint = null;
        if (previousWatchPath !== automation.schedule?.watchPath)
            automation.watchCandidate = null;

        // An edit invalidates an in-flight scheduler claim. Its old next-run
        // calculation must not overwrite the newly saved schedule.
        automation.schedulerLockedAt = null;
        automation.schedulerLockToken = null;
        automation.markModified("schedulerLockedAt");
        automation.markModified("schedulerLockToken");
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
                storageContextId,
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

        if (isOwner && body.pinnedToHome !== undefined) {
            await setHomeWidget(
                user._id,
                automation,
                Boolean(body.pinnedToHome),
            );
        }

        const { block: homeBlock } = isOwner
            ? await findHomeWidget(user._id, automation._id)
            : { block: null };

        return NextResponse.json(
            serializeAutomation(automation, {
                ...(savedContent !== undefined
                    ? { content: savedContent }
                    : {}),
                pinnedToHome: Boolean(homeBlock),
                isOwner,
                shareRole: role,
                readOnly: false,
            }),
        );
    } catch (error) {
        return handleError(error);
    }
}

export async function DELETE(request, { params }) {
    params = await params;
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
        await deleteEntityShare("automation", existing._id);

        await updateDigestBlocks(user._id, (blocks) => {
            const next = blocks.filter(
                (b) => String(b.automationId || "") !== String(existing._id),
            );
            return next.length === blocks.length ? null : next;
        });

        await deleteAutomationFolder(user.contextId, existing.slug);

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
