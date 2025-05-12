import { NextResponse } from "next/server";
import { getCurrentUser } from "../utils/auth";
import User from "../models/user";

export async function GET() {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.role !== "admin") {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 403 },
            );
        }

        const users = await User.find({}, "-__v");
        return NextResponse.json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
