import LLM from "../../models/llm";

export async function GET() {
    const defaultModelId = await LLM.findOne({ isDefault: true })?._id;
    return Response.json(
        defaultPrompts.map((prompt) => ({
            ...prompt,
            llm: defaultModelId,
        })),
    );
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

export const dynamic = "force-dynamic"; // defaults to auto
