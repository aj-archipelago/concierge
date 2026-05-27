import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../utils/auth";
import Automation from "../models/automation";
import {
    AUTOMATION_MD,
    calculateNextRunAt,
    automationEffectiveEnabled,
    normalizeAutomationSlug,
    normalizeSchedule,
    serializeAutomation,
    validateAutomationSlug,
    writeAutomationContent,
} from "./utils";

const DEFAULT_AUTOMATION_CONTENT = `# Automation

Describe what Concierge should do when this automation runs.

## Instructions

- Be specific about the output you want.
- Mention any supporting files the automation should use.
`;

export async function GET() {
    try {
        const user = await getCurrentUser();
        const automations = await Automation.find({ owner: user._id }).lean();
        automations.sort(
            (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
        );

        return NextResponse.json({ automations });
    } catch (error) {
        return handleError(error);
    }
}

export async function POST(request) {
    try {
        const user = await getCurrentUser();
        const body = await request.json();
        const name = String(body.name || "").trim();
        const slug = normalizeAutomationSlug(body.slug || name);
        const schedule = normalizeSchedule(body.schedule);
        const timezone = body.timezone || "UTC";
        const enabled = automationEffectiveEnabled(
            Boolean(body.enabled),
            schedule,
        );
        const producesHtml = Boolean(body.producesHtml);
        const description = String(body.description || "").trim();

        if (!name) {
            return NextResponse.json(
                { error: "Automation name is required" },
                { status: 400 },
            );
        }

        if (!validateAutomationSlug(slug)) {
            return NextResponse.json(
                {
                    error: "Slug must be lowercase alphanumeric with hyphens, max 64 characters",
                },
                { status: 400 },
            );
        }

        const path = `automations/${slug}`;
        const nextRunAt = enabled
            ? calculateNextRunAt(schedule, timezone)
            : null;

        const automation = await Automation.create({
            owner: user._id,
            slug,
            name,
            description,
            enabled,
            schedule,
            timezone,
            path,
            inputs: body.inputs || null,
            producesHtml,
            pinnedToSidebar: producesHtml && Boolean(body.pinnedToSidebar),
            nextRunAt,
        });

        const content =
            typeof body.content === "string"
                ? body.content
                : DEFAULT_AUTOMATION_CONTENT;
        const uploadResult = await writeAutomationContent(
            user.contextId,
            slug,
            content,
        );

        if (uploadResult.error) {
            await Automation.deleteOne({ _id: automation._id }).catch(() => {});
            return NextResponse.json(
                { error: `Failed to save ${AUTOMATION_MD}` },
                { status: 500 },
            );
        }

        return NextResponse.json(serializeAutomation(automation, { content }), {
            status: 201,
        });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
