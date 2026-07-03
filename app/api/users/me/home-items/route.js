import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getAppletRegistry } from "../../../canvas-applets/registry";
import { getCurrentUser } from "../../../utils/auth";
import {
    readHomeItemsForUser,
    setHomeItemsForUser,
} from "../homeAppletSettings";

function jsonError(error, fallback = "Internal server error") {
    return NextResponse.json(
        { error: error?.message || fallback },
        { status: error?.status || 500 },
    );
}

async function requireUser() {
    const user = await getCurrentUser(false);
    if (!user?._id) {
        const error = new Error("Unauthorized");
        error.status = 401;
        throw error;
    }
    return user;
}

async function readJson(request) {
    try {
        return await request.json();
    } catch {
        return {};
    }
}

function validateAppletId(appletId) {
    if (!mongoose.Types.ObjectId.isValid(appletId)) {
        const error = new Error("Invalid applet ID");
        error.status = 400;
        throw error;
    }
}

async function validateHomeItems(user, homeItems) {
    await Promise.all(
        homeItems
            .filter((item) => item?.type === "applet")
            .map(async (item) => {
                validateAppletId(item.appletId);
                await getAppletRegistry(user, item.appletId);
            }),
    );
}

export async function GET() {
    try {
        const user = await requireUser();
        const homeItems = await readHomeItemsForUser(user);
        return NextResponse.json({
            homeItems: homeItems.items,
            homeItemsConfigured: homeItems.configured,
            homeItemsDefaultGroupMigrated: homeItems.defaultGroupMigrated,
        });
    } catch (error) {
        return jsonError(error);
    }
}

export async function PUT(request) {
    try {
        const user = await requireUser();
        const { homeItems } = await readJson(request);
        if (!Array.isArray(homeItems)) {
            const error = new Error("Home items are required");
            error.status = 400;
            throw error;
        }
        await validateHomeItems(user, homeItems);

        return NextResponse.json({
            homeItems: await setHomeItemsForUser(user, homeItems),
            homeItemsConfigured: true,
            homeItemsDefaultGroupMigrated: true,
        });
    } catch (error) {
        console.error("Error updating home items:", error);
        return jsonError(error);
    }
}

export const dynamic = "force-dynamic";
