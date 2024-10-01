import Prompt from "../../models/prompt";
import Pathway, { generateRandomString } from "../../models/pathway";
import { getClient, MUTATIONS } from "../../../../src/graphql";
import { getCurrentUser } from "../../utils/auth";
import LLM from "../../models/llm"; // Assuming LLM model is defined elsewhere
import stringcase from "stringcase";

export async function unpublishPrompt(prompt, user) {
    if (prompt.pathway) {
        const pathway = await Pathway.findById(prompt.pathway);
        if (pathway) {
            // Remove pathway from Cortex
            const response = await getClient().mutate({
                mutation: MUTATIONS.DELETE_PATHWAY,
                variables: {
                    name: `${pathway.name}_${pathway._id.toString()}`,
                    userId: user._id.toString(),
                    secret: pathway.secret,
                },
            });

            if (!response.data.deletePathway) {
                throw new Error("Failed to remove pathway from Cortex");
            }

            // Delete the Pathway model
            await Pathway.findByIdAndDelete(pathway._id);
        }
    }

    // Remove pathway reference from prompt
    prompt.pathway = null;
    await prompt.save();
}

export async function publishPrompt(prompt, user) {
    // Determine cortexModelName
    const llm = await LLM.findById(prompt.llm);
    const cortexModelName = llm ? llm.cortexModelName : null;

    let pathwayName = stringcase.snakecase(prompt.title).toLowerCase();
    // Ensure the name is alphanumeric and doesn't start with a number
    pathwayName = pathwayName.replace(/[^a-z0-9_]/g, '')
                              .replace(/^[0-9]+/, '');
    if (pathwayName.length === 0) {
        pathwayName = 'untitled';
    }

    let pathway;
    if (prompt.pathway) {
        // If pathway exists, update it
        pathway = await Pathway.findById(prompt.pathway);
        if (!pathway) {
            // If pathway doesn't exist, create a new one
            pathway = new Pathway({
                owner: user._id,
                name: pathwayName,
                secret: generateRandomString(16)
            });
        } else {
            // Update existing pathway
            pathway.name = pathwayName;
            if (!pathway.secret) {
                pathway.secret = generateRandomString(16);
            }
        }
    } else {
        // Create new pathway
        pathway = new Pathway({
            owner: user._id,
            name: pathwayName,
            secret: generateRandomString(16)
        });
    }

    await pathway.save();

    // Update the prompt with the pathway reference
    prompt.pathway = pathway._id;
    await prompt.save();

    // Push changes to Cortex
    const response = await getClient().mutate({
        mutation: MUTATIONS.PUT_PATHWAY,
        variables: {
            name: `${pathway.name}_${pathway._id.toString()}`,
            pathway: {
                prompt: prompt.text,
                inputParameters: {}, // You may want to update this if needed
                model: cortexModelName,
                displayName: prompt.title,
            },
            userId: user._id.toString(),
            secret: pathway.secret,
        },
    });

    if (!response.data.putPathway) {
        throw new Error("Failed to update pathway in Cortex");
    }
}

export async function GET(req, { params }) {
    const { id } = params;
    try {
        const prompt = await Prompt.findById(id);
        return Response.json(prompt);
    } catch (e) {
        return Response.json({ message: e.message }, { status: 500 });
    }
}

export async function PUT(req, { params }) {
    const { id } = params;
    const attrs = await req.json();
    const user = await getCurrentUser();

    try {
        const prompt = await Prompt.findById(id);
        
        if (!prompt.owner.equals(user._id)) {
            return Response.json({ error: "You are not the owner of this prompt" }, { status: 403 });
        }

        const updatedPrompt = await Prompt.findByIdAndUpdate(id, attrs, { new: true });

        if (attrs.published === false && prompt.published) {
            // Prompt is being unpublished
            await unpublishPrompt(updatedPrompt, user);
        } else if (updatedPrompt.published) {
            // Prompt is being published or updated while published
            await publishPrompt(updatedPrompt, user);
        }

        return Response.json(updatedPrompt);
    } catch (e) {
        console.error(e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
