import GuidePage from "../../../../src/components/help/GuidePage";

export default async function page({ params }) {
    params = await params;
    return <GuidePage guideId={params.id} />;
}
