import Prompt from "../../../models/prompt";
import Workspace from "../../../models/workspace";
import { deletePathway, putPathway } from "../../../pathways/[id]/route";
import { getCurrentUser } from "../../../utils/auth";

async function publishWorkspace(workspace, user, pathwayName, model) {
    const promptIds = workspace.prompts;
    const prompts = await Prompt.find({ _id: { $in: promptIds } });

    // Create a pathway object from the workspace
    const pathwayData = {
        name: pathwayName,
        prompts: prompts.map((p) => p.text),
        inputParameters: workspace.inputParameters,
        model: model,
        owner: user._id,
    };

    // Use putPathway to create or update the pathway
    const responsePathway = await putPathway(
        workspace.pathway,
        pathwayData,
        user,
    );

    workspace.pathway = responsePathway._id;
    await workspace.save();

    return responsePathway;
}

async function unpublishWorkspace(workspace, user) {
    if (workspace.pathway) {
        await deletePathway(workspace.pathway, user);
        workspace.pathway = null;
        await workspace.save();
    }
}

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

        workspace.published = publish;

        if (publish) {
            const pathway = await publishWorkspace(
                workspace,
                user,
                pathwayName,
                model,
            );
            workspace.pathway = pathway._id;
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
