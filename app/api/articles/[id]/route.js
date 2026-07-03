import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../utils/auth";
import { findArticleForAccess, serializeArticle } from "../utils.js";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser(false);
        const loaded = await findArticleForAccess(params.id, user?._id);
        if (!loaded.ok) {
            return NextResponse.json(
                { error: loaded.error },
                { status: loaded.status },
            );
        }

        return NextResponse.json(
            serializeArticle(loaded.article, {
                access: loaded.access,
                readOnly: loaded.readOnly,
                owner: loaded.owner,
            }),
        );
    } catch (error) {
        return handleError(error);
    }
}
