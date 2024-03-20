import Prompt from "../models/prompt";
import Workspace from "../models/workspace";
import WorkspaceMembership from "../models/workspace-membership";
import { getCurrentUser } from "../utils/auth";
import stringcase from "stringcase";

export async function POST(req, res) {
    const body = await req.json();
    const currentUser = await getCurrentUser();

    let bodyName = body.name || "New Workspace";
    let index = 0;
    let name;
    do {
        name = bodyName + (index > 0 ? ` ${index}` : "");
        index++;
    } while (await Workspace.findOne({ name }));

    index = 0;
    let slug;
    do {
        slug = stringcase.spinalcase(bodyName) + (index > 0 ? `-${index}` : "");
        index++;
    } while (await Workspace.findOne({ slug }));

    const workspace = await Workspace.create({
        name,
        slug,
        owner: currentUser._id,
    });

    return Response.json(workspace);
}

export async function GET(req, res) {
    try {
        const currentUser = await getCurrentUser();
        const workspaceMemberships = await WorkspaceMembership.find({
            user: currentUser._id,
        });
        let workspaces = await Workspace.find({
            $or: [
                {
                    owner: currentUser._id,
                },
                {
                    _id: {
                        $in: workspaceMemberships.map(
                            (membership) => membership.workspace,
                        ),
                    },
                },
            ],
        }).sort({ updatedAt: -1 });

        return Response.json(workspaces);
    } catch (error) {
        console.error(error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
