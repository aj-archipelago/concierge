import Workspace from "../models/workspace";
import stringcase from "stringcase";

export async function createWorkspace({
    workspaceName,
    ownerId,
    prompts = [],
    systemPrompt,
}) {
    let index = 0;
    let name;
    do {
        name = workspaceName + (index > 0 ? ` ${index}` : "");
        index++;
    } while (await Workspace.findOne({ name }));

    index = 0;
    let slug;
    do {
        slug =
            stringcase.spinalcase(workspaceName) +
            (index > 0 ? `-${index}` : "");
        index++;
    } while (await Workspace.findOne({ slug }));

    const workspace = await Workspace.create({
        name,
        slug,
        owner: ownerId,
        prompts,
        systemPrompt,
    });
    return workspace;
}
