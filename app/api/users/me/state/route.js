import UserState from "../../../models/user-state";
import { getCurrentUser } from "../../../utils/auth";

function transformUserState(userState) {
    if (userState.transcribe && typeof userState.transcribe === "string") {
        userState.transcribe = JSON.parse(userState.transcribe);

        // if it's still a string, it's bad data, delete it
        if (typeof userState.transcribe === "string") {
            delete userState.transcribe;
        }
    }
    return userState;
}

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

    return Response.json(transformUserState(userState));
}

export async function PUT(req) {
    const body = await req.json();
    const user = await getCurrentUser();

    if (body.transcribe && typeof body.transcribe !== "string") {
        body.transcribe = JSON.stringify(body.transcribe);
    }

    const userState = await UserState.findOneAndUpdate(
        {
            user: user._id,
        },
        {
            ...body,
            user: user._id,
        },
        {
            upsert: true,
            new: true,
        },
    );

    return Response.json(transformUserState(userState));
}

// don't want nextjs to cache this endpoint
export const dynamic = "force-dynamic";
