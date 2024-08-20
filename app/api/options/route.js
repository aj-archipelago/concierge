import User from "../models/user";
import mongoose from "mongoose";

export async function POST(req) {
    try {
        const body = await req.json();

        const { userId, contextId, aiMemorySelfModify, aiName, aiStyle } = body;

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
            }
            if (aiStyle !== undefined) {
                user.aiStyle = aiStyle;
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
