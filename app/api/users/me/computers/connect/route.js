import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../utils/auth";
import {
    createCompanionHandoff,
    companionAdmin,
    requireCompanionOrigin,
} from "../../../../utils/companion";

export const dynamic = "force-dynamic";

export async function POST(request) {
    try {
        requireCompanionOrigin(request);
        const user = await getCurrentUser(false);
        const { intent = { kind: "connect" }, ticket } = await request.json();
        if (ticket !== undefined)
            return NextResponse.json(
                await companionAdmin(user, "handoff-status", { ticket }),
                { headers: { "Cache-Control": "no-store" } },
            );
        return NextResponse.json(
            await createCompanionHandoff(user, request, intent),
            {
                headers: { "Cache-Control": "no-store" },
            },
        );
    } catch (error) {
        return NextResponse.json(
            { error: "Could not open the companion. Please try again." },
            { status: error.status || 503 },
        );
    }
}
