import Prompt from "../models/prompt";
import Workspace from "../models/workspace";
import WorkspaceMembership from "../models/workspace-membership";
import { getCurrentUser } from "../utils/auth";
import stringcase from "stringcase";

export async function POST(req, res) {
    const body = await req.json();
    const currentUser = await getCurrentUser();

    // create prompts
    const prompts = await Promise.all(
        defaultPrompts.map(async (prompt) => {
            return await Prompt.create({
                title: prompt.title,
                text: prompt.text,
                owner: currentUser._id,
            });
        }),
    );

    let bodyName = body.name || "Workspace";
    let index = 0;
    let name;
    do {
        name = bodyName + (index > 0 ? ` ${index}` : "");
        index++;
    } while (await Workspace.findOne({ name }));

    index = 0;
    let slug;
    do {
        slug = stringcase.spinalcase(bodyName) + (index > 0 ? `-${index}` : "");
        index++;
    } while (await Workspace.findOne({ slug }));

    const workspace = await Workspace.create({
        name,
        slug,
        prompts: prompts.map((prompt) => prompt._id),
        owner: currentUser._id,
    });

    return Response.json(workspace);
}

export async function GET(req, res) {
    try {
        const currentUser = await getCurrentUser();
        const workspaceMemberships = await WorkspaceMembership.find({
            user: currentUser._id,
        });
        let workspaces = await Workspace.find({
            $or: [
                {
                    owner: currentUser._id,
                },
                {
                    _id: {
                        $in: workspaceMemberships.map(
                            (membership) => membership.workspace,
                        ),
                    },
                },
            ],
        }).sort({ updatedAt: -1 });

        return Response.json(workspaces);
    } catch (error) {
        console.error(error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}

const defaultPrompts = [
    {
        title: "THUMBNAIL TEXT",
        text: "Provide me with three short, attractive, and catchy titles, with a maximum of 10 words, optimized for social networks for the thumbnail of this video that will be published on social networks.",
    },
    {
        title: "HASHTAGS",
        text: "Provide me with 10 hashtags to optimize SEO searches on Instagram, TikTok and YouTube.",
    },
    {
        title: "INSTAGRAM COPIES",
        text: `Provide me with three copies optimized for posting this video on Instagram that include emojis and 10 words or less. Do not use "the truth", "join us" or imperative verbs with exclamation marks.`,
    },
    {
        title: "YOUTUBE TITLE",
        text: "Provide me with three short and attractive titles optimized for YouTube.",
    },
    {
        title: "YOUTUBE DESCRIPTION",
        text: `Provide me with a description of 300 characters or less with the video's keywords optimized for YouTube. Add the appropriate hashtags to optimize SEO searches on YouTube. Avoid using "the truth".`,
    },
    {
        title: "YOUTUBE SHORTS COPY",
        text: "Provide me with two very brief and catchy copies for YouTube shorts that have 10 words or less.",
    },
    {
        title: "TWITTER COPIES",
        text: `Provide me with three copies optimized for Twitter with 280 characters or less.
        Do not use "the truth", "join" or imperative verbs with exclamation marks.`,
    },
    {
        title: "TIKTOK",
        text: `Provide me with three copies optimized for TikTok with 6 words or less without the word "the truth", "support" or "join". In the end, provide me with the appropriate and optimized hashtags for the TikTok platform.`,
    },
    {
        title: "Video title and optimized copy",
        text: "PROVIDE ME WITH A VIDEO TITLE AND AN OPTIMIZED COPY TO POST ON FACEBOOK",
    },
];
