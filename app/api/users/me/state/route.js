import UserState from "../../../models/user-state";
import { getCurrentUser } from "../../../utils/auth";

export async function GET() {
    const user = await getCurrentUser();
    const userState = await UserState.findOneAndUpdate(
        {
            user: user._id,
        },
        {
            user: user._id,
        },
        {
            upsert: true,
            new: true,
        },
    );
    return Response.json(userState);
}

export async function PUT(req) {
    const body = await req.json();
    const user = await getCurrentUser();
    const userState = await UserState.findOneAndUpdate(
        {
            user: user._id,
        },
        {
            user: user._id,
            $set: body,
        },
        {
            upsert: true,
            new: true,
        },
    );

    return Response.json(userState);
}

// don't want nextjs to cache this endpoint
export const dynamic = "force-dynamic";
