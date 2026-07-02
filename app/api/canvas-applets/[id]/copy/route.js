import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "../../../utils/auth";
import { copyAppletForAdmin } from "../../copy";

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

export async function POST(_request, { params }) {
    params = await params;
    const { id } = params;

    try {
        validateAppletId(id);
        const user = await getCurrentUser();
        const copied = await copyAppletForAdmin(user, id);
        return NextResponse.json(copied);
    } catch (error) {
        console.error("Error copying applet for admin:", error);
        return jsonError(error);
    }
}
