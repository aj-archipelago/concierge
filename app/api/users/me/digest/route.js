import { getCurrentUser } from "../../../utils/auth";
import { generateDigestBlockContent } from "./digest.utils";

import dayjs from "dayjs";
import { NextResponse } from "next/server";
import Digest from "../../../models/digest";

// daily
const UPDATE_INTERVAL = 24 * 60 * 60 * 1000;

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
                    },
                ],
            },
            {
                upsert: true,
                new: true,
            },
        );
    }

    for (const block of digest.blocks) {
        const lastUpdated = block.updatedAt;

        if (
            !lastUpdated ||
            !block.content ||
            dayjs().diff(dayjs(lastUpdated)) > UPDATE_INTERVAL
        ) {
            const content = await generateDigestBlockContent(block, user);

            block.content = content;
            block.updatedAt = new Date();
        }
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

    let newBlocks = blocks;

    for (const block of blocks) {
        const existingBlock = digest.blocks.find(
            (b) => b._id?.toString() === block._id?.toString(),
        );

        if (existingBlock) {
            if (existingBlock.prompt !== block.prompt) {
                block.content = null;
                block.updatedAt = null;
            }
        } else {
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

    return NextResponse.json(digest);
}
