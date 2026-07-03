import AutomationSharedPage from "../../../src/components/automations/AutomationSharedPage";

export default async function Page({ params }) {
    params = await params;
    return <AutomationSharedPage automationId={params.id} />;
}
