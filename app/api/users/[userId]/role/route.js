import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth";
import User from "../../../models/user";

export async function PATCH(request, { params }) {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.role !== "admin") {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 403 },
            );
        }

        const { userId } = params;
        const { role } = await request.json();

        if (!["user", "admin"].includes(role)) {
            return NextResponse.json(
                { error: "Invalid role" },
                { status: 400 },
            );
        }

        // Prevent self-demotion
        if (userId === currentUser._id) {
            return NextResponse.json(
                { error: "Cannot change your own role" },
                { status: 400 },
            );
        }

        const user = await User.findById(userId);
        if (!user) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 },
            );
        }

        user.role = role;
        await user.save();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error updating user role:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
