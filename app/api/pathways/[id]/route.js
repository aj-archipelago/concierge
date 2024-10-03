import { getClient, MUTATIONS } from "../../../../src/graphql";
import Pathway from "../../models/pathway";
import { getCurrentUser } from "../../utils/auth";
import { getPathway } from "./db";

export async function DELETE(req, { params }) {
    const { id } = params;
    const user = await getCurrentUser();
    try {
        return Response.json(await deletePathway(id, user), { status: 200 });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(req, { params }) {
    const { id } = params;
    const attrs = await req.json();
    const user = await getCurrentUser();
    try {
        return Response.json(await putPathway(id, attrs, user), {
            status: 200,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

export async function deletePathway(id, user) {
    if (!id) {
        throw new Error("Pathway ID is required");
    }

    const pathway = await Pathway.findById(id);

    if (pathway) {
        if (!pathway.owner?.equals(user._id)) {
            throw new Error("You are not the owner of this pathway");
        }

        // Call the DELETE_PATHWAY mutation
        await getClient().mutate({
            mutation: MUTATIONS.DELETE_PATHWAY,
            variables: {
                name: pathway.name,
                userId: user.username || user._id.toString(),
                secret: pathway.secret,
            },
        });

        await Pathway.findByIdAndDelete(id);
    }

    return { success: true };
}

export async function putPathway(id, attrs, user) {
    let pathway;

    if (id) {
        pathway = await Pathway.findById(id);
        if (pathway && !pathway.owner?.equals(user._id)) {
            throw new Error("You are not the owner of this pathway");
        }
    }

    if (!pathway) {
        // Create new pathway
        pathway = new Pathway({
            ...attrs,
            owner: user._id,
        });
    } else {
        // Update existing pathway
        Object.assign(pathway, attrs);
    }

    if (!pathway.secret) {
        pathway.secret = Math.random().toString(16).substring(2, 10);
    }

    await pathway.save();

    const result = await getClient().mutate({
        mutation: MUTATIONS.PUT_PATHWAY,
        variables: {
            name: pathway.name,
            pathway: {
                prompt: attrs.prompts,
                inputParameters: {},
                model: attrs.model,
            },
            userId: user.username || user._id.toString(),
            secret: pathway.secret,
        },
    });

    return pathway;
}

export async function GET(req, { params }) {
    const { id } = params;
    const pathway = await getPathway(id);

    if (!pathway) {
        return Response.json({ error: "Pathway not found" }, { status: 404 });
    }

    return Response.json(pathway);
}

export const dynamic = "force-dynamic"; // defaults to auto
