import AutomationRunRoutePage from "../../../../../src/components/automations/AutomationRunRoutePage";

export default async function Page({ params }) {
    params = await params;
    return (
        <AutomationRunRoutePage
            automationId={params.id}
            taskId={params.taskId}
        />
    );
}
