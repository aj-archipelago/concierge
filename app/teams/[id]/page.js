import TeamPage from "../../../src/components/teams/TeamPage";
export default async function Page({ params }) {
    const { id } = await params;
    return <TeamPage teamId={id} />;
}
