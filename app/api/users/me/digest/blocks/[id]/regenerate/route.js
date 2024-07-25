import { NextResponse } from "next/server";
import Digest, {
    DigestGenerationStatus,
} from "../../../../../../models/digest.mjs";
import { getCurrentUser } from "../../../../../../utils/auth";
import { enqueueBuildDigest } from "../../../utils";

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

    digest = await Digest.updateOne(
        {
            owner: user._id,
            "blocks._id": id,
        },
        {
            $set: {
                "blocks.$.state.status": DigestGenerationStatus.PENDING,
            },
        },
        {
            new: true,
        },
    );

    await enqueueBuildDigest(user._id);

    return NextResponse.json(digest);
}
