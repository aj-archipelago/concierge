import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../utils/auth";
import Article from "../../models/article.js";
import { serializeArticle } from "../utils.js";

export const dynamic = "force-dynamic";

function normalizeWorkspacePath(path) {
    if (!path || typeof path !== "string") return null;
    const normalized = path.startsWith("/") ? path : `/${path}`;
    if (!normalized.startsWith("/workspace/files/")) return null;
    if (!/\/articles\//i.test(normalized)) return null;
    return normalized;
}

export async function POST(req) {
    try {
        const user = await getCurrentUser(false);
        if (!user?._id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const body = await req.json();
        const workspacePath = normalizeWorkspacePath(body?.workspacePath);
        if (!workspacePath) {
            return NextResponse.json(
                { error: "Invalid article workspacePath" },
                { status: 400 },
            );
        }

        const title = typeof body?.title === "string" ? body.title.trim() : "";
        const fileHash =
            typeof body?.fileHash === "string" ? body.fileHash : null;
        const blobPath =
            typeof body?.blobPath === "string" ? body.blobPath : null;
        const filename =
            typeof body?.filename === "string" ? body.filename : null;

        const article = await Article.findOneAndUpdate(
            { owner: user._id, workspacePath },
            {
                $set: {
                    title,
                    fileHash,
                    blobPath,
                    filename,
                },
                $setOnInsert: {
                    owner: user._id,
                    workspacePath,
                },
            },
            { upsert: true, new: true, runValidators: true },
        ).lean();

        return NextResponse.json(
            serializeArticle(article, {
                access: { canAccess: true, isOwner: true, role: "editor" },
                readOnly: false,
            }),
        );
    } catch (error) {
        return handleError(error);
    }
}
