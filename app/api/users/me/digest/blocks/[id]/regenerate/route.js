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

    const { taskId } = await enqueueBuildDigest(user._id, id);

    const block = digest.blocks.find((b) => b._id.toString() === id.toString());

    if (!block) {
        return NextResponse.json(
            { message: "Block not found" },
            { status: 404 },
        );
    }

    block.taskId = taskId;

    digest = await Digest.updateOne(
        {
            owner: user._id,
        },
        {
            $set: {
                blocks: digest.blocks,
            },
        },
        {
            new: true,
        },
    );

    return NextResponse.json(digest);
}
