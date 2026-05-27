import { headers } from "next/headers";
import config from "../../../config";
import User from "../models/user";
import mongoose from "mongoose";
import { connectToDatabase } from "../../../src/db.mjs";
import { v4 as uuidv4 } from "uuid";
import dayjs from "dayjs";
import crypto from "crypto";
import { getClient, SYS_ENTITY_UPSERT_PERSONAL } from "../../../src/graphql";
import {
    getEntraPrincipalLogContext,
    isTenantAuthorized,
    parseAuthorizedTenantIds,
    resolveEntraTenantId,
    resolveEntraPrincipalEmail,
} from "./entraPrincipal";

const PERSONAL_ENTITY_PROVISIONING_TIMEOUT_MS = 60 * 1000;
const PERSONAL_ENTITY_PROVISIONING_WAIT_MS = 3000;
const PERSONAL_ENTITY_PROVISIONING_POLL_INTERVAL_MS = 50;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function claimPersonalEntityProvisioning(user) {
    const claimedAt = new Date();
    const staleThreshold = new Date(
        claimedAt.getTime() - PERSONAL_ENTITY_PROVISIONING_TIMEOUT_MS,
    );

    const claimedUser = await User.findOneAndUpdate(
        {
            _id: user._id,
            personalEntityId: null,
            $or: [
                { personalEntityProvisioningAt: { $exists: false } },
                { personalEntityProvisioningAt: null },
                { personalEntityProvisioningAt: { $lt: staleThreshold } },
            ],
        },
        {
            $set: { personalEntityProvisioningAt: claimedAt },
        },
        { new: true },
    );

    if (!claimedUser) {
        return null;
    }

    return { claimedAt, user: claimedUser };
}

async function clearPersonalEntityProvisioning(userId, claimedAt) {
    return User.findOneAndUpdate(
        {
            _id: userId,
            personalEntityProvisioningAt: claimedAt,
        },
        {
            $unset: { personalEntityProvisioningAt: 1 },
        },
        { new: true },
    );
}

async function completePersonalEntityProvisioning(userId, claimedAt, entityId) {
    return User.findOneAndUpdate(
        {
            _id: userId,
            personalEntityProvisioningAt: claimedAt,
        },
        {
            $set: { personalEntityId: entityId },
            $unset: { personalEntityProvisioningAt: 1 },
        },
        { new: true },
    );
}

async function waitForPersonalEntityProvisioning(userId) {
    const deadline = Date.now() + PERSONAL_ENTITY_PROVISIONING_WAIT_MS;

    while (Date.now() < deadline) {
        const refreshedUser = await User.findById(userId);

        if (
            !refreshedUser ||
            refreshedUser.personalEntityId ||
            !refreshedUser.personalEntityProvisioningAt
        ) {
            return refreshedUser;
        }

        await sleep(PERSONAL_ENTITY_PROVISIONING_POLL_INTERVAL_MS);
    }

    return User.findById(userId);
}

async function provisionClaimedPersonalEntity(user, claimedAt) {
    try {
        const client = getClient();
        const { data } = await client.query({
            query: SYS_ENTITY_UPSERT_PERSONAL,
            variables: {
                userId: user.contextId,
                name: user.aiName || "Concierge",
            },
            fetchPolicy: "network-only",
        });
        const result = JSON.parse(data.sys_entity_upsert_personal.result);

        if (!result?.id) {
            await clearPersonalEntityProvisioning(user._id, claimedAt);
            return User.findById(user._id);
        }

        return (
            (await completePersonalEntityProvisioning(
                user._id,
                claimedAt,
                result.id,
            )) || (await User.findById(user._id))
        );
    } catch (err) {
        await clearPersonalEntityProvisioning(user._id, claimedAt);
        console.warn("Failed to create personal entity:", err?.message || err);
        return User.findById(user._id);
    }
}

async function ensurePersonalEntity(user) {
    if (
        !user?.contextId ||
        user.personalEntityId ||
        typeof window !== "undefined"
    ) {
        return user;
    }

    let claim = await claimPersonalEntityProvisioning(user);

    if (!claim) {
        const refreshedUser = await waitForPersonalEntityProvisioning(user._id);

        if (refreshedUser?.personalEntityId) {
            return refreshedUser;
        }

        if (refreshedUser?.personalEntityProvisioningAt) {
            return refreshedUser;
        }

        claim = await claimPersonalEntityProvisioning(refreshedUser || user);

        if (!claim) {
            return refreshedUser || user;
        }
    }

    return provisionClaimedPersonalEntity(claim.user, claim.claimedAt);
}

export const getCurrentUser = async (convertToJsonObj = true) => {
    const auth = config.auth;

    const readyState = mongoose.connection.readyState;
    if (readyState === 0) {
        if (process.env.NEXT_RUNTIME === "nodejs") {
            try {
                await connectToDatabase();
            } catch (error) {
                console.warn(
                    "Failed to connect to MongoDB in getCurrentUser:",
                    error?.message || error,
                );
                return { userId: "nodb", name: "No Database Connected" };
            }
        } else {
            return { userId: "nodb", name: "No Database Connected" };
        }
    } else if (readyState === 2) {
        try {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Connection timeout"));
                }, 10000);
                mongoose.connection.once("open", () => {
                    clearTimeout(timeout);
                    resolve();
                });
                mongoose.connection.once("error", (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });
        } catch (error) {
            console.warn(
                "Failed waiting for MongoDB connection:",
                error?.message || error,
            );
            return { userId: "nodb", name: "No Database Connected" };
        }
    }

    if (!mongoose.connection.readyState) {
        return { userId: "nodb", name: "No Database Connected" };
    }

    let id = null;
    let username = null;

    // Check for Azure App Service authentication headers
    const headerList = headers();
    id = headerList.get("X-MS-CLIENT-PRINCIPAL-ID");
    username = resolveEntraPrincipalEmail(headerList);

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

    const allowedTenantIds = parseAuthorizedTenantIds(
        process.env.ENTRA_AUTHORIZED_TENANT_IDS,
    );

    if (!localAuthToken) {
        const tenantId = resolveEntraTenantId(headerList);

        if (!allowedTenantIds.length) {
            console.warn("Unauthorized Entra request in getCurrentUser", {
                reason: "missing_authorized_tenants",
                ...getEntraPrincipalLogContext(headerList, username),
            });
            if (process.env.NODE_ENV === "production") {
                throw new Error("No authorized Entra tenants configured");
            }
        } else if (!isTenantAuthorized(tenantId, allowedTenantIds)) {
            console.warn("Unauthorized Entra request in getCurrentUser", {
                reason: "tenant_not_authorized",
                ...getEntraPrincipalLogContext(headerList, username),
                allowedTenantIds,
            });
            if (process.env.NODE_ENV === "production") {
                throw new Error(
                    `Unauthorized tenant: ${tenantId || "missing"}`,
                );
            }
        }
    }

    id = id || "anonymous";
    username = username || "Anonymous";

    // If using local auth, try to find existing user by username first
    // (handles case where user previously logged in via Entra with a different userId)
    let user = null;
    if (localAuthToken) {
        user = await User.findOne({ username: username });
        if (user && user.userId !== id) {
            console.log(
                `Found existing user by username: ${username}, reusing with local userId: ${id}`,
            );
            user.userId = id;
        }
    }

    // Atomic find-or-create to prevent duplicate user records from concurrent requests.
    // CosmosDB does not enforce the unique index on userId, so we cannot rely on
    // E11000 duplicate key errors — use findOneAndUpdate with upsert instead.
    if (!user) {
        user = await User.findOneAndUpdate(
            { userId: id },
            {
                $setOnInsert: {
                    userId: id,
                    username,
                    name: username,
                    contextId: uuidv4(),
                    contextKey: crypto.randomBytes(32).toString("hex"),
                    aiMemorySelfModify: true,
                    aiName: "Concierge",
                    agentModel: config.cortex.defaultChatModel,
                },
            },
            { upsert: true, new: true },
        );
    }

    if (!user.contextId) {
        // Only generate contextId on server-side to avoid race conditions
        if (typeof window === "undefined") {
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
    }

    // Migration: Generate contextKey for existing users without one
    if (!user.contextKey) {
        // Only generate contextKey on server-side to avoid race conditions
        if (typeof window === "undefined") {
            console.log(
                `User ${user.userId} has no contextKey, generating one`,
            );
            user.contextKey = crypto.randomBytes(32).toString("hex");
            try {
                user = await user.save();
            } catch (err) {
                console.log("Error saving user contextKey: ", err);
            }
        }
    }

    // Migration: Create personal entity for users without one
    user = await ensurePersonalEntity(user);

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
        delete user.personalEntityProvisioningAt;
    }
    return user;
};

export const handleError = (error) => {
    let message =
        error?.response?.data?.errors ||
        error?.response?.data?.error ||
        error?.response?.data ||
        error?.message ||
        error?.toString();

    let status = 500;

    // Handle Mongoose CastError (e.g., invalid ObjectId)
    if (error?.name === "CastError") {
        status = 400;
        message = `Invalid value for ${error.path}: ${error.value}`;
    } else if (error?.message?.includes("Chat not found")) {
        status = 404;
    }

    console.error(`Error (${status}):`, message);

    if (typeof message !== "string") {
        message = JSON.stringify(message);
    }

    return Response.json(
        {
            error: message,
        },
        { status },
    );
};
