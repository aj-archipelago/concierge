import axios from "../../../utils/axios-client";
const getJiraRestUrl = (siteId) =>
    `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/project`;

export async function GET(request) {
    try {
        // read token parameter from querystring
        const searchParams = request.nextUrl.searchParams;
        const token = searchParams.get("token");
        const site = searchParams.get("siteId");

        // Validate required parameters
        if (!token || !site || site === "undefined") {
            return Response.json(
                { error: "Missing required parameters: token or siteId" },
                { status: 400 }
            );
        }

        const response = await axios.get(getJiraRestUrl(site), {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
                "Content-Type": "application/json",
            },
        });

        // Filter out archived projects
        const activeProjects = response.data.filter(project => {
            // Check if project is archived based on common indicators
            const isArchived = 
                project.archived === true ||
                project.status === 'archived' ||
                project.projectCategory?.name === 'Archived' ||
                project.name?.toLowerCase().includes('(archived)') ||
                project.name?.toLowerCase().includes('[archived]');
            
            return !isArchived;
        });

        return Response.json(activeProjects);
    } catch (error) {
        return Response.json(
            { error: error.message },
            { status: error?.response?.status },
        );
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
