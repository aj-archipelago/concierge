import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../../utils/auth";
import ApiKeyMapping from "../../../models/apiKeyMapping.mjs";

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (user?.role !== "admin")
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const mappings = await ApiKeyMapping.find(
            {},
            "apiKeyHash label",
        ).lean();

        const map = {};
        for (const m of mappings) {
            map[m.apiKeyHash] = m.label;
        }

        return NextResponse.json(map, {
            headers: { "Cache-Control": "private, no-store" },
        });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
