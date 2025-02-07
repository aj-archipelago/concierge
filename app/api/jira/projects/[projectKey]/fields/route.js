import axios from "axios";

export async function GET(request, { params }) {
    try {
        const searchParams = request.nextUrl.searchParams;
        // read token parameter from querystring
        const token = searchParams.get("token");
        const site = searchParams.get("siteId");
        const issueTypeId = searchParams.get("issueTypeId");
        const { projectKey } = params;

        const response = await axios.get(
            `https://api.atlassian.com/ex/jira/${site}/rest/api/3/issue/createmeta/${projectKey}/issuetypes/${issueTypeId}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            },
        );

        return Response.json(response.data.fields);
    } catch (error) {
        console.log("error", error);
        return Response.json(
            { error: error.message },
            { status: error?.response?.status },
        );
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
