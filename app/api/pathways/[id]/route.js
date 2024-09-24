import { getClient, MUTATIONS } from "../../../../src/graphql";
import Pathway from "../../models/pathway";
import { getCurrentUser } from "../../utils/auth";
import { getPathway } from "./db";

export async function DELETE(req, { params }) {
    const { id } = params;
    const user = await getCurrentUser();
    const pathway = await Pathway.findById(id);

    if (!pathway.owner?.equals(user._id)) {
        return Response.json(
            { error: "You are not the owner of this pathway" },
            { status: 403 },
        );
    }

    await Pathway.findByIdAndDelete(id);
    return Response.json({ success: true });
}

export async function PUT(req, { params }) {
    const { id } = params;
    const attrs = await req.json();
    const pathway = await Pathway.findById(id);
    const user = await getCurrentUser();

    if (!pathway.owner?.equals(user._id)) {
        return Response.json(
            { error: "You are not the owner of this pathway" },
            { status: 403 },
        );
    }

    const newPathway = await Pathway.findByIdAndUpdate(id, attrs, {
        new: true,
    });

    newPathway.secret = "foo";
    console.log("newPathway", newPathway);

    // convert inputParameters to a hash instead of an array
    const inputParameters = newPathway.inputParameters.reduce((acc, param) => {
        acc[param.key] = param.value;
        return acc;
    }, {});
    console.log("inputParameters", inputParameters);


    const response = await getClient().mutate({
        mutation: MUTATIONS.UPDATE_PATHWAY,
        variables: {
            name: newPathway.name,
            pathway: {
                prompt: newPathway.prompt,
                inputParameters,
                model: newPathway.model,
            },
            userId: user._id,
            secret: newPathway.secret,
        },
    });

    console.log("Response", response);

    return Response.json(newPathway); 
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
