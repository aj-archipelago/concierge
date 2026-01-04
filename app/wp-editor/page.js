import WPEditorClientPage from "./WPEditorClientPage";
import "./components/editor/Diff.scss";

/**
 * WordPress Editor Integration Page
 *
 * This page renders the WordPress editor components that can be embedded
 * in WordPress via iframe or loaded as a standalone page.
 *
 * Access: https://labeeb.example.com/wp-editor
 */

export const dynamic = "force-dynamic";

export default async function WordPressEditorPage() {
    return <WPEditorClientPage />;
}
