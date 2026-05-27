import GuidePage from "../../../../src/components/help/GuidePage";

export default function page({ params }) {
    return <GuidePage guideId={params.id} />;
}
