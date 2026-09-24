import { Suspense } from "react";
import ColleaguesPage from "../../src/components/colleagues/ColleaguesPage";
export default function Page() {
    return (
        <Suspense>
            <ColleaguesPage />
        </Suspense>
    );
}
