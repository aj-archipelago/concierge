import axios from "axios";
const getJiraRestUrl = siteId => `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/issue`;

export async function POST(request) {
    try {
        const { title, description, projectKey, siteId, token, issueType } =
            await request.json();

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
                        name: issueType,
                    },
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
        console.error(error?.response?.data?.errors || error?.response?.data?.error || error?.response?.data || error?.toString());
        return Response.json({ error: JSON.stringify(error?.response?.data?.errors || error?.response?.data?.error || error?.response?.data || error?.toString()) });
    }
}
