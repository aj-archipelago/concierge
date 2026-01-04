import { NextResponse } from "next/server";
import StyleGuide from "../../models/style-guide.js";
import { getCurrentUser } from "../../utils/auth.js";

// GET: retrieve a single style guide
export async function GET(request, { params }) {
    try {
        const { id } = params;

        const styleGuide = await StyleGuide.findById(id)
            .populate("file")
            .populate("uploadedBy", "name username");

        if (!styleGuide) {
            return NextResponse.json(
                { error: "Style guide not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({
            success: true,
            styleGuide,
        });
    } catch (error) {
        console.error("Error fetching style guide:", error);
        return NextResponse.json(
            { error: "Failed to fetch style guide" },
            { status: 500 },
        );
    }
}

// DELETE: delete a style guide (admin only)
export async function DELETE(request, { params }) {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.role !== "admin") {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 403 },
            );
        }

        const { id } = params;

        const styleGuide = await StyleGuide.findByIdAndDelete(id);

        if (!styleGuide) {
            return NextResponse.json(
                { error: "Style guide not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({
            success: true,
            message: "Style guide deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting style guide:", error);
        return NextResponse.json(
            { error: "Failed to delete style guide" },
            { status: 500 },
        );
    }
}

// PATCH: update a style guide (admin only)
export async function PATCH(request, { params }) {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.role !== "admin") {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 403 },
            );
        }

        const { id } = params;
        const body = await request.json();
        const { name, description, isActive } = body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (isActive !== undefined) updateData.isActive = isActive;

        const styleGuide = await StyleGuide.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true,
        })
            .populate("file")
            .populate("uploadedBy", "name username");

        if (!styleGuide) {
            return NextResponse.json(
                { error: "Style guide not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({
            success: true,
            styleGuide,
        });
    } catch (error) {
        console.error("Error updating style guide:", error);
        return NextResponse.json(
            { error: "Failed to update style guide" },
            { status: 500 },
        );
    }
}
