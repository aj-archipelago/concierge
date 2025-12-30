import crypto from "crypto";
import Workspace from "../models/workspace";
import stringcase from "stringcase";

export async function createWorkspace({
    workspaceName,
    ownerId,
    prompts = [],
    systemPrompt,
    applet = null,
}) {
    // Use workspace name as is
    const name = workspaceName;

    // Generate a random 8-character hex string for the slug
    const generateRandomSlug = () => {
        const randomHex = Math.random().toString(16).substring(2, 10);
        return `${stringcase.spinalcase(workspaceName)}-${randomHex}`;
    };

    // Try up to 3 times to generate a unique slug
    let attempts = 0;
    let slug;
    let existingWorkspace;

    do {
        slug = generateRandomSlug();
        existingWorkspace = await Workspace.findOne({ slug });
        attempts++;
    } while (existingWorkspace && attempts < 3);

    if (existingWorkspace) {
        throw new Error(
            "Failed to generate unique workspace slug after multiple attempts",
        );
    }

    // Generate a contextKey for the workspace (used for encryption)
    const contextKey = crypto.randomBytes(32).toString("hex");

    const workspace = await Workspace.create({
        name,
        slug,
        owner: ownerId,
        prompts,
        systemPrompt,
        applet,
        contextKey,
    });
    return workspace;
}
