import { headers } from "next/headers";
import config from "../../../config";
import User from "../models/user";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import dayjs from "dayjs";
import crypto from "crypto";

export const getCurrentUser = async (convertToJsonObj = true) => {
    const auth = config.auth;

    if (!mongoose.connection.readyState) {
        return { userId: "nodb", name: "No Database Connected" };
    }

    let id = null;
    let username = null;

    // Check for Azure App Service authentication headers
    const headerList = headers();
    id = headerList.get("X-MS-CLIENT-PRINCIPAL-ID");
    username = headerList.get("X-MS-CLIENT-PRINCIPAL-NAME");

    // Check for local authentication token (overrides Azure headers in local development)
    let localAuthToken = null;
    try {
        const cookieStore = await import("next/headers").then((m) =>
            m.cookies(),
        );
        const tokenCookie = cookieStore.get("local_auth_token");

        if (tokenCookie?.value) {
            try {
                localAuthToken = JSON.parse(tokenCookie.value);

                // Check if token is expired
                const now = Math.floor(Date.now() / 1000);
                if (
                    localAuthToken.expires_at &&
                    localAuthToken.expires_at < now
                ) {
                    console.log("Local auth token expired");
                    localAuthToken = null;
                } else {
                    console.log(
                        `Using local auth token for user: ${localAuthToken.user.email}`,
                    );
                    // Use the Azure header format for consistency
                    id = localAuthToken.user.id;
                    username = localAuthToken.user.email;
                }
            } catch (error) {
                console.error("Error parsing local auth token:", error);
                localAuthToken = null;
            }
        }
    } catch (error) {
        console.error("Error reading local auth token:", error);
    }

    // Validate auth provider if specified
    if (auth.provider && auth.provider !== "entra") {
        throw new Error(`Unsupported auth provider: ${auth.provider}`);
    }

    // Apply domain validation for both Entra and local auth
    if (username && process.env.ENTRA_AUTHORIZED_DOMAINS) {
        const allowedEmailDomains = process.env.ENTRA_AUTHORIZED_DOMAINS.split(
            ",",
        ).map((emailDomain) => emailDomain.toLowerCase());

        const emailDomain = username.split("@")[1]?.toLowerCase();
        if (!emailDomain || !allowedEmailDomains.includes(emailDomain)) {
            console.log(
                `User domain ${emailDomain} not in authorized domains: ${allowedEmailDomains.join(", ")}`,
            );
            // For local development, allow all domains if no specific domains are configured
            if (process.env.NODE_ENV === "production") {
                throw new Error(`Unauthorized domain: ${emailDomain}`);
            }
        }
    }

    id = id || "anonymous";
    username = username || "Anonymous";

    let user = await User.findOne({ userId: id });

    // If not found by userId, try to find by username (for local auth with existing users)
    if (!user && localAuthToken) {
        console.log(`Looking for existing user by username: ${username}`);
        user = await User.findOne({ username: username });
        if (user) {
            console.log(
                `Found existing user by username: ${username}, reusing with local userId: ${id}`,
            );
            // Update the userId to the local ID for this session
            user.userId = id;
        } else {
            console.log(`No existing user found with username: ${username}`);
        }
    }

    if (!user) {
        console.log("User not found in DB: ", id);
        const name = username;
        const contextId = uuidv4();
        const contextKey = crypto.randomBytes(32).toString("hex");
        const aiMemorySelfModify = true;
        const aiName = "Labeeb";
        const aiStyle = "OpenAI";

        user = await User.create({
            userId: id,
            username,
            name,
            contextId,
            contextKey,
            aiMemorySelfModify,
            aiName,
            aiStyle,
        });
    } else if (!user.contextId) {
        console.log(
            `User ${user.userId} has no contextId, creating the contextId`,
        );
        user.contextId = uuidv4();
        try {
            user = await user.save();
        } catch (err) {
            console.log("Error saving user: ", err);
        }
    }

    // Migration: Generate contextKey for existing users without one
    if (!user.contextKey) {
        console.log(`User ${user.userId} has no contextKey, generating one`);
        user.contextKey = crypto.randomBytes(32).toString("hex");
        try {
            user = await user.save();
        } catch (err) {
            console.log("Error saving user contextKey: ", err);
        }
    }

    // more than 30 mins
    if (!user.lastActiveAt || dayjs().diff(user.lastActiveAt, "minute") > 30) {
        user.lastActiveAt = new Date();
        try {
            user = await user.save();
        } catch (err) {
            console.log("Error saving user: ", err);
        }
    }

    // user._id coming from mongoose is an object, even after calling toJSON()
    // and nextJS does not like passing it from a server to a client component
    // so we convert to JSON stringify and parse to get a plain object
    if (convertToJsonObj) {
        user = JSON.parse(JSON.stringify(user.toJSON()));
    }
    return user;
};

export const handleError = (error) => {
    console.error(
        error?.response?.data?.errors ||
            error?.response?.data?.error ||
            error?.response?.data ||
            error?.toString(),
    );
    return Response.json(
        {
            error: JSON.stringify(
                error?.response?.data?.errors ||
                    error?.response?.data?.error ||
                    error?.response?.data ||
                    error?.toString(),
            ),
        },
        { status: 500 },
    );
};
