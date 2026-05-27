import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth";
import { getClient, QUERIES } from "../../../../src/graphql";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const currentUser = await getCurrentUser(false);
        const userId = currentUser?.contextId || currentUser?.userId;

        if (!userId) {
            return NextResponse.json({ available: true });
        }

        const client = getClient(undefined, undefined, {
            suppressNetworkErrors: true,
        });
        await client.query({
            query: QUERIES.SYS_GET_ENTITIES,
            variables: { userId, fresh: String(Date.now()) },
            fetchPolicy: "network-only",
        });

        return NextResponse.json({ available: true });
    } catch {
        return NextResponse.json({ available: false });
    }
}
