import { headers } from "next/headers";
import config from "../../../config";
import User from "../models/user";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

export const getCurrentUser = async () => {
    const auth = config.auth;

    if (!mongoose.connection.readyState) {
        return { userId: "nodb", name: "No Database Connected" };
    }

    if (auth.provider && auth.provider !== "entra") {
        throw new Error(`Unsupported auth provider: ${auth.provider}`);
    }

    const headerList = headers();
    const id = headerList.get("X-MS-CLIENT-PRINCIPAL-ID") || "anonymous";
    let user = await User.findOne({ userId: id });

    if (!user) {
        console.log("User not found in DB: ", id);
        const username =
            headerList.get("X-MS-CLIENT-PRINCIPAL-NAME") || "Anonymous";
        const name = username;
        const contextId = uuidv4();
        const aiMemory = "{}";
        const aiMemorySelfModify = true;

        user = await User.create({
            userId: id,
            username,
            name,
            contextId,
            aiMemory,
            aiMemorySelfModify,
        });
    } else if (!user.contextId) {
        console.log(`User ${user.userId} has no contextId, creating the contextId`);
        user.contextId = uuidv4();
        try {
            user = await user.save();
        } catch (err) {
            console.log("Error saving user: ", err);
        }
    }

    // user._id coming from mongoose is an object, even after calling toJSON()
    // and nextJS does not like passing it from a server to a client component
    // so we convert to JSON stringify and parse to get a plain object
    user = JSON.parse(JSON.stringify(user.toJSON()));
    return user;
};
