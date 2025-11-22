import { NextResponse } from "next/server";
import StyleGuide from "../models/style-guide.js";
import File from "../models/file.js";
import { getCurrentUser } from "../utils/auth.js";
import { handleStreamingFileUpload } from "../utils/upload-utils.js";

// GET: retrieve all active style guides
export async function GET() {
    try {
        const styleGuides = await StyleGuide.find({ isActive: true })
            .populate("file")
            .populate("uploadedBy", "name username")
            .sort({ createdAt: -1 });

        return NextResponse.json({
            success: true,
            styleGuides,
        });
    } catch (error) {
        console.error("Error fetching style guides:", error);
        return NextResponse.json(
            { error: "Failed to fetch style guides" },
            { status: 500 },
        );
    }
}

// POST: create a new style guide (admin only)
export async function POST(request) {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.role !== "admin") {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 403 },
            );
        }

        // Check if this is a file upload or metadata submission
        const contentType = request.headers.get("content-type");

        if (contentType && contentType.includes("multipart/form-data")) {
            // Handle file upload using the cortex file handler
            const result = await handleStreamingFileUpload(request, {
                getWorkspace: async () => ({ _id: "system" }), // Dummy workspace for system files
                checkAuthorization: null, // Already checked admin above
                associateFile: async (newFile, workspace, user) => {
                    // Don't associate with any workspace, just return the file
                    return { success: true, files: [] };
                },
                errorPrefix: "style guide file upload",
                permanent: true, // Use permanent storage for system files
            });

            if (result.error) {
                return result.error;
            }

            return NextResponse.json({
                success: true,
                file: result.data.file,
            });
        } else {
            // Handle metadata submission to create style guide
            const body = await request.json();
            const { name, description, fileId } = body;

            if (!name || !fileId) {
                return NextResponse.json(
                    { error: "Name and file are required" },
                    { status: 400 },
                );
            }

            // Verify the file exists
            const file = await File.findById(fileId);
            if (!file) {
                return NextResponse.json(
                    { error: "File not found" },
                    { status: 404 },
                );
            }

            // Create the style guide
            const styleGuide = new StyleGuide({
                name,
                description,
                file: fileId,
                uploadedBy: currentUser._id,
                isActive: true,
            });

            await styleGuide.save();

            // Populate the file and uploadedBy fields
            await styleGuide.populate("file");
            await styleGuide.populate("uploadedBy", "name username");

            return NextResponse.json({
                success: true,
                styleGuide,
            });
        }
    } catch (error) {
        console.error("Error creating style guide:", error);
        return NextResponse.json(
            { error: "Failed to create style guide" },
            { status: 500 },
        );
    }
}
