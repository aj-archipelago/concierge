import mongoose from "mongoose";
import stringcase from "stringcase";
import Workspace, { workspaceSchema } from "../../models/workspace";
import WorkspaceState from "../../models/workspace-state";
import App from "../../models/app";
import AppletFile from "../../models/applet-file";
import AppletSharedFile from "../../models/applet-shared-file";
import File from "../../models/file";
import { getCurrentUser } from "../../utils/auth";
import { getWorkspace } from "./db";
import { republishWorkspace, unpublishWorkspace } from "./publish/utils";

export async function DELETE(req, { params }) {
    params = await params;
    const { id } = params;
    const user = await getCurrentUser();
    const workspace = await Workspace.findById(id);

    if (!workspace.owner?.equals(user._id)) {
        return Response.json(
            { error: "You are not the owner of this workspace" },
            { status: 403 },
        );
    }

    // Check if there are any published applets for this workspace
    const publishedApp = await App.findOne({
        workspaceId: workspace._id,
        type: "applet",
        status: "active",
    });

    if (publishedApp) {
        return Response.json(
            {
                error: "Cannot delete workspace with published applet. Please unpublish the applet first.",
                hasPublishedApplet: true,
                appName: publishedApp.name,
            },
            { status: 400 },
        );
    }

    await unpublishWorkspace(workspace, user);

    // Clean up AppletFile and File documents associated with this workspace
    if (workspace.applet) {
        const [appletFiles, sharedFiles] = await Promise.all([
            AppletFile.find({
                appletId: workspace.applet,
            }).populate("files"),
            AppletSharedFile.findOne({
                appletId: workspace.applet,
            }).populate("files"),
        ]);

        const fileIdsToDelete = [];
        appletFiles.forEach((appletFile) => {
            appletFile.files.forEach((file) => {
                if (file._id) {
                    fileIdsToDelete.push(file._id);
                }
            });
        });
        (sharedFiles?.files || []).forEach((file) => {
            if (file?._id) {
                fileIdsToDelete.push(file._id);
            }
        });

        if (fileIdsToDelete.length > 0) {
            await File.deleteMany({ _id: { $in: fileIdsToDelete } });
        }

        await AppletFile.deleteMany({
            appletId: workspace.applet,
        });
        await AppletSharedFile.deleteMany({ appletId: workspace.applet });
    }

    // Clean up workspace files if any exist
    await File.deleteMany({ _id: { $in: workspace.files || [] } });

    await Workspace.findByIdAndDelete(id);
    await WorkspaceState.deleteMany({ workspace: id });
    return Response.json({ success: true });
}

export async function PUT(req, { params }) {
    params = await params;
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

    await republishWorkspace(newWorkspace);

    return Response.json(newWorkspace);
}

export async function GET(req, { params }) {
    params = await params;
    const { id } = params;
    let workspace = await getWorkspace(id);

    if (!workspace) {
        if (!mongoose.isObjectIdOrHexString(id)) {
            // The id is not a valid ObjectId, so it could be an old record with
            // a plaintext slug.
            //
            // TEMPORARY CODE - DO NOT REMOVE UNTIL MIGRATION IS COMPLETE
            // This code handles backwards compatibility for workspaces that still use
            // unencrypted slugs in production. It attempts to find and migrate old
            // workspace records that haven't been updated to the new slug format.
            // This block can be safely removed once all production workspaces
            // have been migrated to use encrypted slugs. See ARC-2487 for more details.
            const connection = await mongoose.createConnection(
                process.env.MONGO_URI,
            );
            const LegacyWorkspaceModel = connection.model(
                "Workspace",
                workspaceSchema,
            );

            const legacyWorkspace = await LegacyWorkspaceModel.findOne({
                slug: id,
            });

            if (legacyWorkspace) {
                workspace = await getWorkspace(legacyWorkspace._id);

                // migrate to new slug using the new model
                await Workspace.findByIdAndUpdate(legacyWorkspace._id, {
                    $set: {
                        slug: workspace.slug,
                    },
                });
            }
        }
    }

    if (!workspace) {
        return Response.json({ error: "Workspace not found" }, { status: 404 });
    }

    return Response.json(workspace);
}

export const dynamic = "force-dynamic"; // defaults to auto
