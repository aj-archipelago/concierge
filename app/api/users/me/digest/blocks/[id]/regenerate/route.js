import { NextResponse } from "next/server";
import Digest from "../../../../../../models/digest";
import { getCurrentUser } from "../../../../../../utils/auth";
import { generateDigestBlockContent } from "../../../digest.utils";

export async function POST(req, { params }) {
    const user = await getCurrentUser();
    const { id } = params;

    let digest = await Digest.findOne({
        owner: user._id,
    });

    if (!digest) {
        return NextResponse.json(
            { message: "Digest not found" },
            { status: 404 },
        );
    }

    const block = digest.blocks.find((b) => b._id.toString() === id.toString());

    if (!block) {
        return NextResponse.json(
            { message: "Block not found" },
            { status: 404 },
        );
    }

    const content = await generateDigestBlockContent(block, user);

    digest = await Digest.updateOne(
        {
            owner: user._id,
            "blocks._id": id,
        },
        {
            $set: {
                "blocks.$.content": content,
                "blocks.$.updatedAt": new Date(),
            },
        },
        {
            new: true,
        },
    );

    return NextResponse.json(digest);
}
