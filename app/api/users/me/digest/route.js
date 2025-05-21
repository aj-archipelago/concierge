import { getCurrentUser } from "../../../utils/auth";

import { NextResponse } from "next/server";
import Digest from "../../../models/digest";
import { enqueueBuildDigest } from "./utils";

export async function GET(req, { params }) {
    const user = await getCurrentUser();

    let digest = await Digest.findOne({
        owner: user._id,
    });

    if (!digest) {
        digest = await Digest.findOneAndUpdate(
            {
                owner: user._id,
            },
            {
                owner: user._id,
                blocks: [
                    {
                        prompt: `What's going on in the world today? If you know my profession, give me updates specific to my profession and preferences. Otherwise, give me general updates.`,
                        title: "Daily digest",
                    },
                ],
            },
            {
                upsert: true,
                new: true,
            },
        );

        await enqueueBuildDigest(user._id);
    }

    digest = await Digest.findOneAndUpdate(
        {
            owner: user._id,
        },
        {
            owner: user._id,
            blocks: digest.blocks,
        },
        {
            upsert: true,
            new: true,
        },
    );

    digest = digest.toJSON();

    return NextResponse.json(digest);
}

export async function PATCH(req, { params }) {
    const user = await getCurrentUser();
    const { blocks } = await req.json();

    const oldDigest = await Digest.findOne({
        owner: user._id,
    });

    const oldBlocks = oldDigest?.blocks;

    let newDigest = await Digest.findOneAndUpdate(
        {
            owner: user._id,
        },
        {
            owner: user._id,
            blocks: blocks,
        },
        {
            new: true,
        },
    );

    const newBlocks = newDigest.blocks;

    for (const newBlock of newBlocks) {
        const oldBlock = oldBlocks.find(
            (b) => b._id?.toString() === newBlock._id?.toString(),
        );

        //   if the prompt has changed or if there's no content,
        // we need to regenerate the block
        if (
            !oldBlock ||
            oldBlock?.prompt !== newBlock.prompt ||
            !newBlock.content
        ) {
            console.log("regenerating block", newBlock._id);
            const { taskId } = await enqueueBuildDigest(user._id, newBlock._id);
            newBlock.taskId = taskId;
            newBlock.updatedAt = null;
            newBlock.content = null;
        }
    }

    await Digest.findOneAndUpdate(
        {
            owner: user._id,
        },
        {
            blocks: newBlocks,
        },
    );

    return NextResponse.json(newDigest);
}
