import User from "../../models/user";
import { getCurrentUser, handleError } from "../../utils/auth";

export async function DELETE(req, { params }) {
    try {
        const { id } = params;

        const currenctUser = await getCurrentUser(false);

        // Use findByIdAndUpdate to update user in one step
        const user = await User.findByIdAndUpdate(
            currenctUser._id,
            { $pull: { uploadedDocs: { docId: id } } },
            { new: true, useFindAndModify: false },
        );

        if (!user) throw new Error("User not found");

        return Response.json({ status: "success" });
    } catch (error) {
        return handleError(error);
    }
}

export async function GET(req, { params }) {
    try {
        const { id } = params;

        const user = await getCurrentUser(false);

        if (!user) throw new Error("User not found");

        // Find the document with the provided id
        const doc = user.uploadedDocs.find((doc) => doc.docId === id);

        if (!doc) {
            return Response.json(
                { status: "error", message: "Document not found" },
                { status: 404 },
            );
        }

        return Response.json({ status: "success", doc });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
