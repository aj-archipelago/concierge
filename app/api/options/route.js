import User from "../models/user";
import mongoose from "mongoose";
import { getClient, SYS_ENTITY_UPDATE } from "../../../src/graphql";

export async function POST(req) {
    try {
        const body = await req.json();

        const {
            userId,
            contextId,
            aiMemorySelfModify,
            aiName,
            agentModel,
            useCustomEntities,
            reasoningEffort,
        } = body;

        if (!mongoose.connection.readyState) {
            throw new Error("Database is not connected");
        }

        let user = await User.findOne({ userId: userId });

        if (user) {
            if (aiMemorySelfModify !== undefined) {
                user.aiMemorySelfModify = aiMemorySelfModify;
            }
            if (contextId !== undefined) {
                user.contextId = contextId;
            }
            if (aiName !== undefined) {
                user.aiName = aiName;
                if (user.personalEntityId) {
                    try {
                        const client = getClient();
                        await client.query({
                            query: SYS_ENTITY_UPDATE,
                            variables: {
                                entityId: user.personalEntityId,
                                contextId: user.contextId,
                                name: aiName,
                            },
                            fetchPolicy: "network-only",
                        });
                    } catch (error) {
                        console.warn(
                            "Failed to sync aiName to Cortex entity:",
                            error?.message,
                        );
                    }
                }
            }
            if (agentModel !== undefined) {
                user.agentModel = agentModel;
            }
            if (useCustomEntities !== undefined) {
                user.useCustomEntities = useCustomEntities;
            }
            if (reasoningEffort !== undefined) {
                user.reasoningEffort = reasoningEffort;
                if (user.personalEntityId) {
                    try {
                        const client = getClient();
                        await client.query({
                            query: SYS_ENTITY_UPDATE,
                            variables: {
                                entityId: user.personalEntityId,
                                contextId: user.contextId,
                                reasoningEffort,
                            },
                            fetchPolicy: "network-only",
                        });
                    } catch (error) {
                        console.warn(
                            "Failed to sync reasoningEffort to Cortex entity:",
                            error?.message,
                        );
                    }
                }
            }
            await user.save();
            return Response.json({ status: "success" });
        } else {
            throw new Error(`User with id ${userId} not found`);
        }
    } catch (error) {
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
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
