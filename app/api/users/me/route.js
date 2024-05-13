import { getCurrentUser } from "../../utils/auth";

export async function GET() {
    const user = await getCurrentUser();
    return Response.json(user);
}

// don't want nextjs to cache this endpoint
export const dynamic = "force-dynamic";
