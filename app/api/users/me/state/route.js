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

    console.log(
        "serializedState length:",
        userState?.serializedState?.length || 0,
    );
    console.log(
        "serializedState preview:",
        userState?.serializedState?.substring(0, 200) || "null",
    );

    let userStateObject;

    try {
        userStateObject = JSON.parse(userState.serializedState);
        console.log("Parsed state keys:", Object.keys(userStateObject || {}));
        if (userStateObject?.media?.images) {
            console.log(
                "Media images count:",
                userStateObject.media.images.length,
            );
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

    console.log("PUT body keys:", Object.keys(body));
    if (body.media?.images) {
        console.log("PUT media images count:", body.media.images.length);
    }

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
                    console.log(
                        "Current state keys:",
                        Object.keys(currentStateObject || {}),
                    );
                    if (currentStateObject?.media?.images) {
                        console.log(
                            "Current media images count:",
                            currentStateObject.media.images.length,
                        );
                    }
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

            console.log("New state keys:", Object.keys(newStateObject || {}));
            if (newStateObject?.media?.images) {
                console.log(
                    "New media images count:",
                    newStateObject.media.images.length,
                );
            }

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
                console.log(
                    `Version conflict on PUT, retry ${retries}/${maxRetries}`,
                );
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
