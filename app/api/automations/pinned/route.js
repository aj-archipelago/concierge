import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../utils/auth";
import Automation from "../../models/automation";
import { fetchRecentRunsByAutomationId } from "./recentRunsForPinned";

export async function GET() {
    try {
        const user = await getCurrentUser();
        const automations = await Automation.find({
            owner: user._id,
            producesHtml: true,
            pinnedToSidebar: true,
        })
            .select(
                "slug name description latestRunTaskId latestHtmlOutputPath updatedAt",
            )
            .lean();
        automations.sort(
            (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
        );

        const runsByAutomationId = await fetchRecentRunsByAutomationId({
            ownerId: user._id,
            automations,
        });

        const payload = automations.map((doc) => ({
            ...doc,
            recentRuns: runsByAutomationId.get(String(doc._id)) || [],
        }));

        return NextResponse.json({ automations: payload });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
