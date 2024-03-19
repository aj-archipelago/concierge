import stringcase from "stringcase";
import Workspace from "../../models/workspace";
import { getCurrentUser } from "../../utils/auth";
import { getWorkspace } from "./queries";

export async function DELETE(req, { params }) {
    const { id } = params;
    const user = await getCurrentUser();
    const workspace = await Workspace.findById(id);

    if (!workspace.owner?.equals(user._id)) {
        return Response.json(
            { error: "You are not the owner of this workspace" },
            { status: 403 },
        );
    }

    await Workspace.findByIdAndDelete(id);
    return Response.json({ success: true });
}

export async function PUT(req, { params }) {
    const { id } = params;
    const attrs = await req.json();
    const workspace = await Workspace.findById(id);
    const user = await getCurrentUser();

    if (!workspace.owner?.equals(user._id)) {
        return Response.json(
            { error: "You are not the owner of this workspace" },
            { status: 403 },
        );
    }

    if (attrs.slug) {
        let slug = attrs.slug;
        let index = 1;

        while (await Workspace.findOne({ slug, _id: { $ne: id } })) {
            slug =
                stringcase.spinalcase(attrs.slug) +
                (index > 0 ? `-${index}` : "");
            index++;
        }

        attrs.slug = slug;
    }

    const newWorkspace = await Workspace.findByIdAndUpdate(id, attrs, {
        new: true,
    });

    return Response.json(newWorkspace);
}

export async function GET(req, { params }) {
    const { id } = params;

    return Response.json(await getWorkspace(id));
}


