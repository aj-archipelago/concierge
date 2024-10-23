import Pathway, { generateRandomString } from "../models/pathway";
import stringcase from "stringcase";

export async function createPathway({
    pathwayName,
    ownerId,
    prompts = [],
    systemPrompt,
    prompt, // Added prompt field
    inputParameters, // Added inputParameters field
    model, // Added model field
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
        prompts,
        systemPrompt,
        prompt, // Added prompt field
        inputParameters, // Added inputParameters field
        model, // Added model field
        secret: generateRandomString(),
    });
    return pathway;
}
