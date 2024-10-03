import { getClient, MUTATIONS } from "../../../../src/graphql";
import Pathway from "../../models/pathway";
import { getCurrentUser } from "../../utils/auth";
import mongoose from "mongoose";

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

export async function getPathway(id) {
    let pathway;

    if (mongoose.isObjectIdOrHexString(id)) {
        pathway = await Pathway.findOne({ _id: id });
    } else {
        pathway = await Pathway.findOne({ name: id });
    }

    const user = await getCurrentUser();

    if (!pathway) {
        return;
    }

    if (!pathway.owner?.equals(user._id)) {
        return;
    }

    pathway = pathway.toJSON();
    pathway.joined = true;
    return pathway;
}

export async function createPathway({
    pathwayName,
    ownerId,
    prompt,
    inputParameters,
    model,
}) {
    let index = 0;
    let name;
    do {
        name = pathwayName + (index > 0 ? ` ${index}` : "");
        index++;
    } while (await Pathway.findOne({ name }));

    const pathway = await Pathway.create({
        name,
        owner: ownerId,
        prompt,
        inputParameters,
        model,
    });
    return pathway;
}
