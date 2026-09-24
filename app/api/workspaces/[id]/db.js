import crypto from "crypto";
import mongoose from "mongoose";
import Workspace from "../../models/workspace";
import WorkspaceMembership from "../../models/workspace-membership";
import { getCurrentUser } from "../../utils/auth";
import { resolveShareAccess } from "../../utils/shareAccess";

export async function getWorkspace(id) {
    let workspace;

    if (mongoose.isObjectIdOrHexString(id)) {
        workspace = await Workspace.findOne({ _id: id }).populate({
            path: "prompts",
            populate: {
                path: "files",
                model: "File",
            },
        });
    } else {
        workspace = await Workspace.findOne({ slug: id }).populate({
            path: "prompts",
            populate: {
                path: "files",
                model: "File",
            },
        });
    }

    const user = await getCurrentUser(false);

    if (!workspace || !user?._id) {
        return;
    }

    const access = await resolveShareAccess({
        entityType: "workspace",
        entityId: workspace._id,
        userId: user._id,
        ownerId: workspace.owner,
    });

    let membership = null;
    if (!access.isOwner) {
        membership = await WorkspaceMembership.findOne({
            user: user._id,
            workspace: workspace._id,
        }).lean();
    }

    if (!access.canAccess && !membership) {
        return;
    }

    // Migration: Generate contextKey for accessible existing workspaces without one.
    if (!workspace.contextKey) {
        console.log(
            `Workspace ${workspace._id} has no contextKey, generating one`,
        );
        const newContextKey = crypto.randomBytes(32).toString("hex");
        try {
            await Workspace.findByIdAndUpdate(workspace._id, {
                contextKey: newContextKey,
            });
            workspace.contextKey = newContextKey;
        } catch (err) {
            console.log("Error saving workspace contextKey: ", err);
        }
    }

    workspace = workspace.toJSON();
    workspace.isOwner = access.isOwner;
    workspace.shareRole = workspace.isOwner
        ? "editor"
        : access.canAccess || membership
          ? "viewer"
          : null;
    workspace.readOnly = !workspace.isOwner;
    workspace.joined = !!membership;
    return workspace;
}
