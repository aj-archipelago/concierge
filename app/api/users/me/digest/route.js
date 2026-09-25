import { hydrateDigestContent } from "../../../../../jobs/digest/content-storage.js";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import {
    mergeDigestEdit,
    updateDigestBlocks,
} from "../../../utils/digest-store.mjs";
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
            tool: latestRun?.data?.tool || null,
            hasHtmlOutput,
            hasWidgetHtml: Boolean(
                latestRun?.automation?.widgetHtmlOutputPath ||
                    parsed.widgetHtml,
            ),
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
    const blocks = (digest.blocks || []).map((block) => ({
        ...block,
        content: hydrateDigestContent(block.content),
    }));
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

export async function GET() {
    const user = await getCurrentUser();
    let digest = await Digest.findOne({ owner: user._id });
    if (!digest) {
        // A deterministic ID makes concurrent first reads create one document.
        digest = await Digest.findOneAndUpdate(
            { _id: user._id, owner: user._id },
            { $setOnInsert: { owner: user._id, blocks: [] } },
            { upsert: true, new: true },
        );
        digest = await Digest.findOne({ owner: user._id });
    }
    return NextResponse.json(await enrichDigest(digest.toJSON(), user._id));
}

export async function PATCH(req) {
    const user = await getCurrentUser();
    const { blocks } = await req.json();
    if (!Array.isArray(blocks))
        return NextResponse.json(
            { error: "Blocks must be an array" },
            { status: 400 },
        );
    const requested = blocks.map((block) => ({
        ...block,
        _id: block._id || new mongoose.Types.ObjectId(),
        generationKey: randomUUID(),
    }));
    const needsBuild = new Set();
    let digest = await updateDigestBlocks(user._id, (current) => {
        needsBuild.clear();
        const edited = mergeDigestEdit(current, requested);
        for (const block of edited) {
            const old = current.find(
                (b) => String(b._id) === String(block._id),
            );
            if (
                !block.automationId &&
                (!old || old.prompt !== block.prompt || !block.content)
            )
                needsBuild.add(String(block._id));
        }
        return edited;
    });
    if (!digest)
        return NextResponse.json(
            { error: "Digest not found" },
            { status: 404 },
        );
    for (const id of needsBuild) await enqueueBuildDigest(user._id, id);
    digest = await Digest.findOne({ owner: user._id });
    return NextResponse.json(await enrichDigest(digest.toJSON(), user._id));
}

export const dynamic = "force-dynamic";
