import JiraIssueCreate from "../../../../src/components/code/JiraIssueCreate";

export default function JiraPage() {
    const clientSecret = process.env.JIRA_CLIENT_SECRET;
    
    return <JiraIssueCreate
        clientSecret={clientSecret}
    />;
}
