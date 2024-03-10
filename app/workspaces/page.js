import Workspaces from "./components/Workspaces";
import Prompt from "../api/models/prompt";
import Workspace from "../api/models/workspace";
import { getCurrentUser } from "../api/utils/auth";
import WorkspaceMembership from "../api/models/workspace-membership";

export default async function Page() {
    const user = await getCurrentUser();
    const workspaces = await Workspace.find({
        $or: [
            {
                _id: {
                    $in: await WorkspaceMembership.find({
                        user: user._id,
                    }).distinct("workspace"),
                },
            },
            {
                owner: user._id,
            },
        ],
    }).sort({ createdAt: -1 });

    return <Workspaces workspaces={workspaces} />;
}
