import AutomationHtmlPage from "../../../../../src/components/automations/AutomationHtmlPage";

export default async function Page({ params }) {
    params = await params;
    return (
        <AutomationHtmlPage automationId={params.id} taskId={params.taskId} />
    );
}
