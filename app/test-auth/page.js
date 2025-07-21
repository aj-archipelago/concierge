import { AuthTestPanel } from "../../src/components/AuthTestPanel";

export default function TestAuthPage() {
    return (
        <div className="container mx-auto px-4 py-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-center mb-8">
                    Token Expiration Test
                </h1>

                <div className="text-center mb-8">
                    <p className="text-gray-600">
                        Test authentication flows by expiring your current
                        token.
                    </p>
                </div>

                <AuthTestPanel />
            </div>
        </div>
    );
}
