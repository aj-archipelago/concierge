import { getTokenUsageCollection } from "./database";
import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../utils/auth";
import { parseUsageQuery, queryUsage } from "./usageQuery";

export async function GET(req) {
    try {
        const user = await getCurrentUser();
        if (user?.role !== "admin")
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        const options = parseUsageQuery(req.nextUrl.searchParams);
        const results = await queryUsage(
            await getTokenUsageCollection(),
            options,
        );
        return NextResponse.json(results, {
            headers: { "Cache-Control": "private, no-store" },
        });
    } catch (error) {
        if (error.status === 400)
            return NextResponse.json({ error: error.message }, { status: 400 });
        if (error.status === 401 || error.statusCode === 401)
            return handleError(error);
        console.error("Usage query failed", {
            name: error.name,
            code: error.code,
        });
        return NextResponse.json(
            {
                error: "Usage could not be loaded. Please retry or select a shorter window.",
            },
            { status: 503 },
        );
    }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
