import AppletSharedRoutePage from "../../../src/components/applets/AppletSharedRoutePage";

export default async function Page({ params }) {
    params = await params;
    return <AppletSharedRoutePage appletId={params.id} />;
}
