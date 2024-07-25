import { getCurrentUser } from "../../../utils/auth";

import { NextResponse } from "next/server";
import Digest from "../../../models/digest";
import { enqueueBuildDigest } from "./utils";
import { DigestGenerationStatus } from "../../../models/digest.mjs";

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
                        prompt: `Good morning! What's going on in the world today? If you know my profession, give me updates specific to my profession and preferences. Otherwise, give me general updates.`,
                        title: "Daily digest",
                        state: {
                            status: DigestGenerationStatus.PENDING,
                        },
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

    return NextResponse.json(digest);
}

export async function PATCH(req, { params }) {
    const user = await getCurrentUser();
    const { blocks } = await req.json();

    let digest = await Digest.findOne({
        owner: user._id,
    });

    let newBlocks = digest.blocks;

    for (const block of blocks) {
        const existingBlock = newBlocks.find(
            (b) => b._id?.toString() === block._id?.toString(),
        );

        if (existingBlock) {
            if (existingBlock.prompt !== block.prompt) {
                block.content = null;
                block.updatedAt = null;
            }
        } else {
            block.state = {
                status: DigestGenerationStatus.PENDING,
            };
            newBlocks.push(block);
        }
    }

    digest = await Digest.findOneAndUpdate(
        {
            owner: user._id,
        },
        {
            owner: user._id,
            blocks: newBlocks,
        },
        {
            upsert: true,
            new: true,
        },
    );

    await enqueueBuildDigest(user._id);

    return NextResponse.json(digest);
}
