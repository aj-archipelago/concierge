import Prompt from "../../../models/prompt";
import Workspace from "../../../models/workspace";
import { deletePathway, putPathway } from "../../../pathways/[id]/route";
import { getCurrentUser } from "../../../utils/auth";

async function publishWorkspace(workspace, user, pathwayName, model) {
    console.log(`Publishing workspace: ${workspace._id}`);
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

    console.log(`Finished publishing workspace: ${workspace._id}`);
    return responsePathway;
}

async function unpublishWorkspace(workspace, user) {
    console.log(`Unpublishing workspace: ${workspace._id}`);

    if (workspace.pathway) {
        await deletePathway(workspace.pathway, user);
        workspace.pathway = null;
        await workspace.save();
    }

    console.log(`Finished unpublishing workspace: ${workspace._id}`);
}

export async function POST(req, { params }) {
    console.log("POST request received for workspace publish/unpublish");
    const { id } = params;
    const { publish, pathwayName, model } = await req.json();
    const user = await getCurrentUser();

    console.log(`Workspace ID: ${id}, Publish: ${publish}, User: ${user._id}`);

    try {
        const workspace = await Workspace.findOne({
            _id: id,
            owner: user._id,
        });

        if (!workspace) {
            console.log(`Workspace not found: ${id}`);
            return Response.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        console.log(`Updating workspace published status to: ${publish}`);
        workspace.published = publish;

        if (publish) {
            console.log("Publishing workspace as pathway");
            const pathway = await publishWorkspace(
                workspace,
                user,
                pathwayName,
                model,
            );
            workspace.pathway = pathway._id;
        } else {
            console.log("Unpublishing workspace");
            await unpublishWorkspace(workspace, user);
        }

        await workspace.save();

        console.log(
            "Workspace publish/unpublish operation completed successfully",
        );
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
