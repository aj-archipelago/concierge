import axios from "../../../utils/axios-client";
const getJiraRestUrl = (siteId) =>
    `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/project`;

export async function GET(request) {
    try {
        // read token parameter from querystring
        const searchParams = request.nextUrl.searchParams;
        const token = searchParams.get("token");
        const site = searchParams.get("siteId");

        const response = await axios.get(getJiraRestUrl(site), {
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
