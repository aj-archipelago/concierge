import Workspace from "../../../models/workspace";
import { getCurrentUser } from "../../../utils/auth";
import {
    publishWorkspace,
    unpublishWorkspace,
    republishWorkspace,
} from "./utils";

export async function POST(req, { params }) {
    const { id } = params;
    const { publish, pathwayName, model } = await req.json();
    const user = await getCurrentUser();

    try {
        const workspace = await Workspace.findOne({
            _id: id,
            owner: user._id,
        });

        if (!workspace) {
            return Response.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        if (publish) {
            if (workspace.published) {
                await republishWorkspace(workspace);
            } else {
                const pathway = await publishWorkspace(
                    workspace,
                    user,
                    pathwayName,
                    model,
                );
                workspace.pathway = pathway._id;
                workspace.published = publish;
            }
        } else {
            await unpublishWorkspace(workspace, user);
        }

        await workspace.save();

        return Response.json(workspace);
    } catch (error) {
        console.error("Error in workspace publish/unpublish:", error);

        if (error.name === "ApolloError" && error.graphQLErrors.length > 0) {
            const graphQLError = error.graphQLErrors[0];
            return Response.json(
                { error: graphQLError.message },
                { status: 400 },
            );
        }

        return Response.json({ error: error.message }, { status: 500 });
    }
}
