import axios from "../../utils/axios-client";
import { getCurrentUser } from "../utils/auth";

export async function POST(req, res) {
    try {
        const body = await req.json();
        const { message, screenshot } = body;

        const user = await getCurrentUser();

        const blocks = [
            {
                type: "rich_text",
                elements: [
                    {
                        type: "rich_text_section",
                        elements: [
                            {
                                type: "text",
                                text: `Feedback from ${user.name}:`,
                                style: {
                                    bold: true,
                                },
                            },
                        ],
                    },
                ],
            },
            {
                type: "rich_text",
                elements: [
                    {
                        type: "rich_text_section",
                        elements: [
                            {
                                type: "text",
                                text: message,
                            },
                        ],
                    },
                ],
            },
        ];

        if (screenshot) {
            blocks.push({
                type: "image",
                title: {
                    type: "plain_text",
                    text: "Screenshot",
                    emoji: true,
                },
                image_url: screenshot,
                alt_text: "Screenshot",
            });
        }

        axios.post(process.env.SLACK_WEBHOOK_URL, {
            blocks: blocks,
        });
        return Response.json({ success: true });
    } catch (error) {
        console.error("Error sending Slack message:", error);
        return Response.json({ error: "Failed to send message" }, 500);
    }
}
