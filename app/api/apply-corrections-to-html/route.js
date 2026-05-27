import { getClient } from "../../../src/graphql";
import Run from "../models/run";
import { getCurrentUser } from "../utils/auth";
import { gql } from "@apollo/client";

export async function POST(req, res) {
    const body = await req.json();
    const { html, correctedText } = body;

    const user = await getCurrentUser();

    try {
        // Validate required input
        if (html === undefined || html === null) {
            return Response.json(
                {
                    message:
                        "HTML content is required. Please provide 'html' field in the request body.",
                    received: {
                        hasHtml: html !== undefined && html !== null,
                        htmlType: typeof html,
                        bodyKeys: Object.keys(body || {}),
                        hint: "The request body should include 'html' field containing the HTML content to process.",
                    },
                },
                { status: 400 },
            );
        }

        if (typeof html !== "string") {
            return Response.json(
                {
                    message: "HTML content must be a string",
                    receivedType: typeof html,
                },
                { status: 400 },
            );
        }

        if (html.trim().length === 0) {
            return Response.json(
                {
                    message: "HTML content cannot be empty",
                },
                { status: 400 },
            );
        }

        // Use the styleguide_html pathway
        // This pathway accepts 'text' parameter (HTML) and optional 'correctedText' parameter
        const pathwayName = "styleguide_html";

        // Create a GraphQL query for the pathway
        // correctedText is optional, so we always include it in the query definition
        const query = gql`
            query StyleguideHtml($text: String!, $correctedText: String) {
                ${pathwayName}(text: $text, correctedText: $correctedText) {
                    result
                }
            }
        `;

        // Prepare variables - styleguide_html pathway expects 'text' parameter with HTML
        // and optionally 'correctedText' if provided
        const variables = {
            text: html, // Pass HTML as text parameter
        };

        if (correctedText && correctedText.trim().length > 0) {
            variables.correctedText = correctedText;
        }

        console.log(
            "Apply corrections to HTML variables",
            JSON.stringify(
                {
                    pathwayName,
                    textLength: html?.length,
                    correctedTextLength: correctedText?.length,
                    hasCorrectedText: !!correctedText,
                    variables,
                },
                null,
                2,
            ),
        );

        const response = await getClient().query({
            query,
            variables,
        });

        if (!response?.data?.[pathwayName]) {
            throw new Error(`No data returned from ${pathwayName} pathway`);
        }

        let correctedHtml = response.data[pathwayName].result;

        // Strip markdown code block wrappers if present (sometimes LLM wraps HTML in ```html ... ```)
        if (correctedHtml && typeof correctedHtml === "string") {
            // Remove markdown code block wrappers (```html ... ``` or ``` ... ```)
            correctedHtml = correctedHtml.replace(/^```(?:html)?\s*\n?/i, ""); // Remove opening ```
            correctedHtml = correctedHtml.replace(/\n?```\s*$/i, ""); // Remove closing ```
            correctedHtml = correctedHtml.trim();
        }

        // Create a run record for tracking
        const run = await Run.create({
            output: correctedHtml,
            citations: [],
            owner: user._id,
        });

        return Response.json({
            originalHtml: html,
            correctedHtml: correctedHtml,
            runId: run._id,
        });
    } catch (error) {
        console.error("Apply corrections to HTML error:", error);
        return Response.json({ message: error.message }, { status: 500 });
    }
}

export const dynamic = "force-dynamic";
