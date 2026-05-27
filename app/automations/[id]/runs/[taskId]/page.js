import AutomationHtmlPage from "../../../../../src/components/automations/AutomationHtmlPage";

export default function Page({ params }) {
    return (
        <AutomationHtmlPage automationId={params.id} taskId={params.taskId} />
    );
}
