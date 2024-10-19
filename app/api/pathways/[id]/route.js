import { getCurrentUser } from "../../utils/auth";
import { getPathway, putPathway, deletePathway } from "./db";

export async function DELETE(req, { params }) {
    const { id } = params;
    const user = await getCurrentUser();
    try {
        return Response.json(await deletePathway(id, user), { status: 200 });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(req, { params }) {
    const { id } = params;
    const attrs = await req.json();
    const user = await getCurrentUser();
    try {
        return Response.json(await putPathway(id, attrs, user), {
            status: 200,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req, { params }) {
    const { id } = params;
    const pathway = await getPathway(id);

    if (!pathway) {
        return Response.json({ error: "Pathway not found" }, { status: 404 });
    }

    return Response.json(pathway);
}

export const dynamic = "force-dynamic"; // defaults to auto
