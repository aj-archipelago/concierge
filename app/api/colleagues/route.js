import { getCurrentUser } from "../utils/auth";
import { colleagueRequest, searchColleagues } from "../utils/colleagues.js";
export const dynamic = "force-dynamic";
export async function GET(request) {
    try {
        const user = await getCurrentUser();
        if (!user)
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        const params = new URL(
            request?.url || "http://localhost/api/colleagues",
        ).searchParams;
        const options = Object.fromEntries(
            ["query", "offset", "limit", "sort", "status", "access"].map(
                (key) => [key, params.get(key) || undefined],
            ),
        );
        options.descending = params.get("descending") === "true";
        if (params.has("ids"))
            options.ids = params.get("ids").split(",").filter(Boolean);
        return Response.json(await searchColleagues(user, options), {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        return Response.json(
            { error: error.message },
            { status: error.status || 503 },
        );
    }
}
export async function POST(request) {
    try {
        const user = await getCurrentUser();
        if (!user)
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        const settings = await request.json();
        const colleague = await colleagueRequest("manage", {
            userId: user.contextId,
            action: "create",
            settings: JSON.stringify(settings),
        });
        return Response.json(colleague, { status: 201 });
    } catch (error) {
        return Response.json(
            { error: error.message },
            { status: error.status || 503 },
        );
    }
}
