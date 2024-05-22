import User from "../models/user";
import { getCurrentUser, handleError } from "../utils/auth";

export async function GET(req) {
    try {
        const user = await getCurrentUser(false);

        const uploadedDocs = user.uploadedDocs;

        return Response.json({ status: "success", uploadedDocs });
    } catch (error) {
        return handleError(error);
    }
}

export async function POST(req) {
    try {
        const { filename, docId } = await req.json();

        // Decode the filename to show the original filename
        const decodedFilename = decodeURIComponent(
            decodeURIComponent(filename),
        );

        const currentUser = await getCurrentUser(false);

        const user = await User.findByIdAndUpdate(
            currentUser._id,
            {
                $push: {
                    uploadedDocs: {
                        $each: [{ filename: decodedFilename, docId }],
                        $position: 0,
                    },
                },
            },
            { new: true, useFindAndModify: false },
        );

        if (!user) throw new Error("User not found");

        return Response.json({ status: "success" });
    } catch (error) {
        return handleError(error);
    }
}

export async function DELETE(req) {
    try {
        const currentUser = await getCurrentUser();

        const user = await User.findByIdAndUpdate(
            currentUser._id,
            { $set: { uploadedDocs: [] } },
            { new: true, useFindAndModify: false },
        );

        if (!user) throw new Error("User not found");

        return Response.json({ status: "success" });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
