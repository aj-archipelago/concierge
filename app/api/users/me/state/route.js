import UserState from "../../../models/user-state.mjs";
import { getCurrentUser } from "../../../utils/auth";

function transformUserState(userState) {
    if (userState.toJSON) {
        userState = userState.toJSON();
    }

    if (userState.transcribe && typeof userState.transcribe === "string") {
        userState.transcribe = JSON.parse(userState.transcribe);

        // clean up bad data
        if (
            typeof userState.transcribe === "string" ||
            Object.keys(userState.transcribe).length > 50
        ) {
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

    let userStateObject;

    if (!userState.serializedState) {
        // migrate to the new state model
        userStateObject = transformUserState(userState);
        delete userStateObject.user;
        delete userStateObject._id;
        delete userStateObject.createdAt;
        delete userStateObject.updatedAt;
        delete userStateObject.__v;
        userState.serializedState = JSON.stringify(userStateObject);
        userState.write = undefined;
        userState.translate = undefined;
        userState.transcribe = undefined;
        userState.jira = undefined;
        await userState.save();
    } else {
        try {
            userStateObject = JSON.parse(userState.serializedState);
        } catch (e) {
            console.error("Error deserializing serializedState during GET", e);
            userStateObject = {};
        }
    }

    return Response.json(userStateObject);
}

export async function PUT(req) {
    const body = await req.json();
    const user = await getCurrentUser();

    const currentState = await UserState.findOne({ user: user._id });

    let currentStateObject;
    if (currentState.serializedState) {
        try {
            currentStateObject = JSON.parse(currentState.serializedState);
        } catch (e) {
            // Corrupted serializedState. Reset to empty object.
            console.error("Error deserializing serializedState during PUT", e);
            currentStateObject = {};
        }
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
        },
    );

    return Response.json(newStateObject);
}

// don't want nextjs to cache this endpoint
export const dynamic = "force-dynamic";
