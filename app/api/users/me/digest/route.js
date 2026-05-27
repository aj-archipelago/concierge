import { getCurrentUser } from "../../../utils/auth";

import { NextResponse } from "next/server";
import Digest from "../../../models/digest";
import Automation from "../../../models/automation";
import Task from "../../../models/task.mjs";
import {
    AUTOMATION_TASK_TYPE,
    buildHtmlPreview,
    parseAutomationTaskOutput,
    scheduleAutomationRefIdBackfill,
} from "../../../automations/utils";
import { enqueueBuildDigest } from "./utils";

function isAutomationLinked(block) {
    return Boolean(block?.automationId);
}

async function loadAutomationContext(blocks, ownerId) {
    const ids = [
        ...new Set(
            blocks
                .filter(isAutomationLinked)
                .map((block) => String(block.automationId)),
        ),
    ];
    if (ids.length === 0) {
        return {
            automationsById: new Map(),
            latestRunByAutomationId: new Map(),
        };
    }

    const automations = await Automation.find({
        _id: { $in: ids },
        owner: ownerId,
    }).lean();
    const automationsById = new Map(
        automations.map((automation) => [String(automation._id), automation]),
    );

    // CSFLE: avoid filters on automation.automationId (analyze_query / 31133).
    // CSFLE also rejects aggregations that reference $$ROOT, so we can't use
    // $group/$first server-side. Pull recent automation tasks and pick the
    // latest per automationId in JS instead.
    const automationIds = automations.map((automation) => automation._id);
    const idSet = new Set(automationIds.map((id) => String(id)));
    const recentRuns = await Task.find({
        owner: ownerId,
        type: AUTOMATION_TASK_TYPE,
    })
        .sort({ createdAt: -1 })
        .limit(Math.max(200, automationIds.length * 25))
        .lean();

    scheduleAutomationRefIdBackfill(recentRuns);

    const latestRunByAutomationId = new Map();
    for (const run of recentRuns) {
        const key = String(
            run?.automationRefId || run?.automation?.automationId || "",
        );
        if (!idSet.has(key)) continue;
        if (!latestRunByAutomationId.has(key)) {
            latestRunByAutomationId.set(key, run);
        }
    }

    return { automationsById, latestRunByAutomationId };
}

function enrichAutomationBlock(block, automation, latestRun) {
    if (!automation) {
        return {
            ...block,
            automation: null,
            automationRun: null,
            automationMissing: true,
        };
    }

    let automationRun = null;
    if (latestRun) {
        const parsed = parseAutomationTaskOutput(latestRun);
        const hasHtmlOutput = Boolean(
            latestRun?.automation?.htmlOutputPath || parsed.html,
        );
        automationRun = {
            taskId: String(latestRun._id),
            status: latestRun.status,
            createdAt: latestRun.createdAt,
            updatedAt: latestRun.updatedAt || null,
            completedAt: latestRun.completedAt || null,
            summary: parsed.summary || latestRun?.data?.summary || "",
            hasHtmlOutput,
            htmlPreview: hasHtmlOutput
                ? latestRun?.automation?.htmlOutputPreview ||
                  (parsed.html ? buildHtmlPreview(parsed.html) : "")
                : "",
        };
    }

    return {
        ...block,
        automation: {
            _id: String(automation._id),
            slug: automation.slug,
            name: automation.name,
            producesHtml: Boolean(automation.producesHtml),
            enabled: Boolean(automation.enabled),
            nextRunAt: automation.nextRunAt || null,
        },
        automationRun,
    };
}

async function enrichDigest(digest, ownerId) {
    const blocks = digest.blocks || [];
    if (blocks.length === 0) return digest;

    const { automationsById, latestRunByAutomationId } =
        await loadAutomationContext(blocks, ownerId);

    return {
        ...digest,
        blocks: blocks.map((block) => {
            if (!isAutomationLinked(block)) return block;
            const automationKey = String(block.automationId);
            return enrichAutomationBlock(
                block,
                automationsById.get(automationKey),
                latestRunByAutomationId.get(automationKey),
            );
        }),
    };
}

export async function GET(req, { params }) {
    const user = await getCurrentUser();

    let digest = await Digest.findOne({
        owner: user._id,
    });

    if (!digest) {
        digest = await Digest.findOneAndUpdate(
            {
                owner: user._id,
            },
            {
                owner: user._id,
                blocks: [
                    {
                        prompt: `What's going on in the world today? If you know my profession, give me updates specific to my profession and preferences. Otherwise, give me general updates.`,
                        title: "Daily digest",
                    },
                ],
            },
            {
                upsert: true,
                new: true,
            },
        );

        await enqueueBuildDigest(user._id);
    }

    digest = await Digest.findOneAndUpdate(
        {
            owner: user._id,
        },
        {
            owner: user._id,
            blocks: digest.blocks,
        },
        {
            upsert: true,
            new: true,
        },
    );

    const enriched = await enrichDigest(digest.toJSON(), user._id);

    return NextResponse.json(enriched);
}

export async function PATCH(req, { params }) {
    const user = await getCurrentUser();
    const { blocks } = await req.json();

    const oldDigest = await Digest.findOne({
        owner: user._id,
    });

    const oldBlocks = oldDigest?.blocks;

    let newDigest = await Digest.findOneAndUpdate(
        {
            owner: user._id,
        },
        {
            owner: user._id,
            blocks: blocks,
        },
        {
            new: true,
        },
    );

    const newBlocks = newDigest.blocks;

    for (const newBlock of newBlocks) {
        // Automation-linked blocks render the latest automation run on read,
        // so they don't need a digest-build task.
        if (isAutomationLinked(newBlock)) {
            newBlock.taskId = undefined;
            newBlock.content = undefined;
            newBlock.updatedAt = undefined;
            continue;
        }

        const oldBlock = oldBlocks.find(
            (b) => b._id?.toString() === newBlock._id?.toString(),
        );

        // If the prompt has changed or there's no content, regenerate the block.
        if (
            !oldBlock ||
            oldBlock?.prompt !== newBlock.prompt ||
            !newBlock.content
        ) {
            const { taskId } = await enqueueBuildDigest(user._id, newBlock._id);
            newBlock.taskId = taskId;
            newBlock.updatedAt = null;
            newBlock.content = null;
        }
    }

    await Digest.findOneAndUpdate(
        {
            owner: user._id,
        },
        {
            blocks: newBlocks,
        },
    );

    const enriched = await enrichDigest(newDigest.toJSON(), user._id);
    return NextResponse.json(enriched);
}

export const dynamic = "force-dynamic";
