import { cortexGrantFetch } from "../api/utils/cortex-grants.mjs";
import { getCurrentUser } from "../api/utils/auth.js";
import { withStoragePrincipal } from "../api/utils/storage-grants.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
    try {
        const user = await getCurrentUser(false);
        if (!user?._id)
            return Response.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        const body = await request.text();
        return await withStoragePrincipal(user, async () => {
            const upstream = await cortexGrantFetch(
                process.env.CORTEX_GRAPHQL_API_URL ||
                    "http://localhost:4000/graphql",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body,
                    signal: request.signal,
                },
            );
            return new Response(upstream.body, {
                status: upstream.status,
                headers: { "Content-Type": "application/json" },
            });
        });
    } catch (error) {
        return Response.json(
            { error: error.status ? error.message : "Cortex request failed" },
            { status: error.status || 502 },
        );
    }
}
