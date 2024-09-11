import axios from "axios";
const getJiraRestUrl = (siteId, projectKey) =>
    `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/project/${projectKey}`;

export async function GET(request, { params }) {
    try {
        const searchParams = request.nextUrl.searchParams;
        // read token parameter from querystring
        const token = searchParams.get("token");
        const site = searchParams.get("siteId");
        const { projectKey } = params;

        const url = getJiraRestUrl(site, projectKey);
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
                "Content-Type": "application/json",
            },
        });

        return Response.json(response.data);
    } catch (error) {
        return Response.json(
            { error: error.message },
            { status: error?.response?.status },
        );
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
