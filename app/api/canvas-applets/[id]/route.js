import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "../../utils/auth";
import {
    deleteAppletRegistry,
    getAppletRegistry,
    updateAppletRegistry,
} from "../registry";

function jsonError(error, fallback = "Internal server error") {
    return NextResponse.json(
        { error: error?.message || fallback },
        { status: error?.status || 500 },
    );
}

function validateAppletId(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        const error = new Error("Invalid applet ID");
        error.status = 400;
        throw error;
    }
}

async function requireUser() {
    const user = await getCurrentUser();
    if (!user?._id) {
        const error = new Error("Unauthorized");
        error.status = 401;
        throw error;
    }
    return user;
}

export async function GET(request, { params }) {
    const { id } = params;

    try {
        validateAppletId(id);
        return NextResponse.json(
            await getAppletRegistry(await requireUser(), id),
        );
    } catch (error) {
        console.error("Error fetching canvas applet:", error);
        return jsonError(error);
    }
}

export async function PUT(request, { params }) {
    const { id } = params;

    try {
        validateAppletId(id);
        const updated = await updateAppletRegistry(
            await requireUser(),
            id,
            await request.json(),
        );
        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating canvas applet:", error);
        return jsonError(error);
    }
}

export async function DELETE(request, { params }) {
    const { id } = params;

    try {
        validateAppletId(id);
        return NextResponse.json(
            await deleteAppletRegistry(await requireUser(), id),
        );
    } catch (error) {
        console.error("Error deleting canvas applet:", error);
        return jsonError(error);
    }
}
