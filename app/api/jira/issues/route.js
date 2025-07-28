import axios from "../../../utils/axios-client";
const getJiraRestUrl = (siteId) =>
    `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/issue`;

export async function POST(request) {
    try {
        const {
            fields,
            title,
            description,
            projectKey,
            siteId,
            token,
            issueType,
        } = await request.json();

        // Validate required parameters
        if (
            !token ||
            !siteId ||
            siteId === "undefined" ||
            !projectKey ||
            !issueType
        ) {
            return Response.json(
                {
                    error: "Missing required parameters: token, siteId, projectKey, or issueType",
                },
                { status: 400 },
            );
        }

        const response = await axios.post(
            getJiraRestUrl(siteId),
            {
                fields: {
                    project: {
                        key: projectKey,
                    },
                    summary: title,
                    description: {
                        type: "doc",
                        version: 1,
                        content: [
                            {
                                type: "paragraph",
                                content: [
                                    {
                                        text: description,
                                        type: "text",
                                    },
                                ],
                            },
                        ],
                    },
                    issuetype: {
                        id: issueType,
                    },
                    ...fields,
                },
            },
            {
                headers: {
                    // Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            },
        );

        const data = response.data;
        return Response.json(data);
    } catch (error) {
        console.error(error);
        const errorString =
            error.response?.data?.errorMessages?.join(", ") ||
            JSON.stringify(error.response?.data?.errors) ||
            error.toString();
        console.error(errorString);
        return Response.json({
            error: errorString,
        });
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
