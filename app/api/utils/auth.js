import { headers } from "next/headers";
import config from "../../../config";
import User from "../models/user";
import mongoose from "mongoose";

export const getCurrentUser = async () => {
    const auth = config.auth;

    if (!mongoose.connection.readyState) {
        return { userId: "nodb", name: "No Database Connected" };
    }

    if (!auth.provider) {
        return;
    }

    if (auth.provider !== "entra") {
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

        user = await User.create({
            userId: id,
            username,
            name,
        });
    }

    // user._id coming from mongoose is an object, even after calling toJSON()
    // and nextJS does not like passing it from a server to a client component
    // so we convert to JSON stringify and parse to get a plain object
    user = JSON.parse(JSON.stringify(user.toJSON()));
    return user;
};
