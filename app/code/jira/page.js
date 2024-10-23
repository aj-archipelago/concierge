import Jira from "../../../src/components/code/Jira";

export default function JiraPage() {
    const clientSecret = process.env.JIRA_CLIENT_SECRET;

    return <Jira clientSecret={clientSecret} />;
}
