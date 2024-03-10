import mongoose from "mongoose";
import Workspace from "../../models/workspace";
import WorkspaceMembership from "../../models/workspace-membership";
import { getCurrentUser } from "../../utils/auth";
import stringcase from "stringcase";

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

        console.log("slug", slug);

        attrs.slug = slug;
    }

    console.log("attrs", attrs);

    const newWorkspace = await Workspace.findByIdAndUpdate(id, attrs, {
        new: true,
    });

    return Response.json(newWorkspace);
}

export async function GET(req, { params }) {
    const { id } = params;

    return Response.json(await getWorkspace(id));
}

export async function getWorkspace(id) {
    let workspace;

    if (mongoose.isObjectIdOrHexString(id)) {
        workspace = await Workspace.findOne({ _id: id });
    } else {
        workspace = await Workspace.findOne({ slug: id });
    }

    const user = await getCurrentUser();

    if (!workspace) {
        return Response.json({ error: "Workspace not found" }, 404);
    }

    let membership;
    if (!workspace.owner?.equals(user._id)) {
        // check if user is a member of the workspace
        membership = await WorkspaceMembership.findOne({
            user: user._id,
            workspace: workspace._id,
        });
    }

    workspace = workspace.toJSON();
    workspace.joined = !!membership;
    return workspace;
}
