import Pathway from "../models/pathway";
import { getCurrentUser } from "../utils/auth";
import { createPathway } from "./db";

export async function POST(req, res) {
    const body = await req.json();
    const currentUser = await getCurrentUser();

    let name = body.name || "New Workspace";
    const pathway = await createPathway({
        pathwayName: name,
        ownerId: currentUser._id,
        prompt: body.prompt, // Added prompt field
        inputParameters: body.inputParameters, // Added inputParameters field
        model: body.model, // Added model field
    });


    return Response.json(pathway);
}

export async function GET(req, res) {
    try {
        const currentUser = await getCurrentUser();
        let pathways = await Pathway.find({
            owner: currentUser._id,
        }).sort({ updatedAt: -1 });

        return Response.json(pathways);
    } catch (error) {
        console.error(error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
