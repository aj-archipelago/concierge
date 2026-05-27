import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../../utils/auth";
import ApiKeyMapping from "../../../models/apiKeyMapping.mjs";

export async function GET() {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.role !== "admin") {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 403 },
            );
        }

        const mappings = await ApiKeyMapping.find(
            {},
            "apiKeyHash label",
        ).lean();

        const map = {};
        for (const m of mappings) {
            map[m.apiKeyHash] = m.label;
        }

        return NextResponse.json(map);
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
