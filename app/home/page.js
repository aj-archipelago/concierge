import { getCurrentUser } from "../api/utils/auth";
import DigestBlockList from "./components/DigestBlockList";

export default async function page() {
    const user = await getCurrentUser();

    return (
        <div className="p-4">
            <DigestBlockList />
        </div>
    );
}
