import mongoose from "mongoose";
import Pathway from "../../models/pathway";
import { getCurrentUser } from "../../utils/auth";

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
