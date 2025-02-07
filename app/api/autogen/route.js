import AutogenRun from "../models/autogenrun";
import { getCurrentUser } from "../utils/auth";

export async function GET(req) {
    const codeRequestId = req.nextUrl.searchParams.get("codeRequestId");
    if (!codeRequestId) {
        return Response.json(
            { error: "Code request ID is required" },
            { status: 400 },
        );
    }
    const currentUser = await getCurrentUser();

    const run = await AutogenRun.findOne({
        requestId: codeRequestId,
        contextId: currentUser.contextId,
    });

    return Response.json(
        {
            data: run || null,
        },
        { status: 200 },
    );
}

export async function DELETE(req) {
    const codeRequestId = req.nextUrl.searchParams.get("codeRequestId");
    if (!codeRequestId) {
        return Response.json(
            { error: "Code request ID is required" },
            { status: 400 },
        );
    }
    const currentUser = await getCurrentUser();

    const result = await AutogenRun.findOneAndDelete({
        requestId: codeRequestId,
        contextId: currentUser.contextId,
    });

    if (!result) {
        return Response.json(
            { message: "No record found to delete" },
            { status: 200 },
        );
    }

    return Response.json(
        { message: "Record deleted successfully" },
        { status: 200 },
    );
}
