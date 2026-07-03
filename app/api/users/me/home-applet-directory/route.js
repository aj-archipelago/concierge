import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "../../../utils/auth";
import { getAppletRegistry } from "../../../canvas-applets/registry";
import {
    addHomeAppletDirectoryItemForUser,
    readHomeAppletDirectoryForUser,
    removeHomeAppletDirectoryItemForUser,
    setHomeAppletDirectoryOrderForUser,
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

function validateAppletId(appletId) {
    if (!mongoose.Types.ObjectId.isValid(appletId)) {
        const error = new Error("Invalid applet ID");
        error.status = 400;
        throw error;
    }
}

async function readJson(request) {
    try {
        return await request.json();
    } catch {
        return {};
    }
}

function directoryResponse(homeAppletDirectory) {
    return NextResponse.json({
        homeAppletDirectory,
        homeAppletIds: homeAppletDirectory.map((entry) => entry.appletId),
    });
}

export async function GET() {
    try {
        const user = await requireUser();
        return directoryResponse(await readHomeAppletDirectoryForUser(user));
    } catch (error) {
        return jsonError(error);
    }
}

export async function POST(request) {
    try {
        const user = await requireUser();
        const { appletId } = await readJson(request);
        validateAppletId(appletId);
        await getAppletRegistry(user, appletId);

        return directoryResponse(
            await addHomeAppletDirectoryItemForUser(user, appletId),
        );
    } catch (error) {
        console.error("Error adding home directory applet:", error);
        return jsonError(error);
    }
}

export async function PUT(request) {
    try {
        const user = await requireUser();
        const { appletIds } = await readJson(request);
        if (!Array.isArray(appletIds)) {
            const error = new Error("Applet IDs are required");
            error.status = 400;
            throw error;
        }

        await Promise.all(
            appletIds.map(async (appletId) => {
                validateAppletId(appletId);
                await getAppletRegistry(user, appletId);
            }),
        );

        return directoryResponse(
            await setHomeAppletDirectoryOrderForUser(user, appletIds),
        );
    } catch (error) {
        console.error("Error reordering home directory applets:", error);
        return jsonError(error);
    }
}

export async function DELETE(request) {
    try {
        const user = await requireUser();
        const body = await readJson(request);
        const appletId =
            body.appletId || new URL(request.url).searchParams.get("appletId");
        validateAppletId(appletId);

        return directoryResponse(
            await removeHomeAppletDirectoryItemForUser(user, appletId),
        );
    } catch (error) {
        console.error("Error removing home directory applet:", error);
        return jsonError(error);
    }
}

export const dynamic = "force-dynamic";
