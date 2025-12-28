import UserState from "../../../models/user-state.mjs";
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

    let userStateObject;

    try {
        // Handle case where serializedState might be undefined (newly created document)
        if (!userState.serializedState) {
            userStateObject = {};
        } else {
            userStateObject = JSON.parse(userState.serializedState);
        }
    } catch (e) {
        console.error("Error deserializing serializedState during GET", e);
        console.error("Problematic JSON:", userState.serializedState);
        userStateObject = {};
    }

    return Response.json(userStateObject);
}

export async function PUT(req) {
    const body = await req.json();
    const user = await getCurrentUser();

    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
        try {
            const currentState = await UserState.findOne({ user: user._id });

            let currentStateObject;
            if (currentState?.serializedState) {
                try {
                    currentStateObject = JSON.parse(
                        currentState.serializedState,
                    );
                } catch (e) {
                    console.error(
                        "Error deserializing serializedState during PUT",
                        e,
                    );
                    currentStateObject = {};
                }
            } else {
                currentStateObject = {};
            }

            const newStateObject = {
                ...currentStateObject,
                ...body,
            };

            const newSerializedState = JSON.stringify(newStateObject);

            await UserState.findOneAndUpdate(
                {
                    user: user._id,
                },
                {
                    serializedState: newSerializedState,
                    user: user._id,
                },
                {
                    upsert: true,
                    new: true,
                    runValidators: true,
                },
            );

            return Response.json(newStateObject);
        } catch (error) {
            if (error.name === "VersionError" && retries < maxRetries - 1) {
                retries++;
                const currentRetry = retries;
                await new Promise((resolve) =>
                    setTimeout(resolve, 100 * currentRetry),
                ); // Exponential backoff
                continue;
            }
            throw error;
        }
    }
}

// don't want nextjs to cache this endpoint
export const dynamic = "force-dynamic";
