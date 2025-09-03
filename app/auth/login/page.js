"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Mail, Lock } from "lucide-react";

export default function LoginPage() {
    const searchParams = useSearchParams();
    const redirectUri = searchParams.get("redirect_uri") || "/";

    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    // Load saved email preference
    useEffect(() => {
        const savedEmail = localStorage.getItem("local_auth_user");
        if (savedEmail) {
            setEmail(savedEmail);
        }
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();

        if (!email) {
            setError("Please enter your email address");
            return;
        }

        setIsLoading(true);
        setError("");

        try {
            const response = await fetch("/api/auth/local", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email: email,
                    redirect_uri: redirectUri,
                }),
            });

            if (response.ok) {
                // Save email preference
                localStorage.setItem("local_auth_user", email);

                // Redirect back to the original URL
                window.location.href = redirectUri;
            } else {
                const data = await response.json();
                setError(data.error || "Login failed");
            }
        } catch (error) {
            setError("Login failed. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900">
                        <User className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                    </div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-gray-100">
                        Sign in to your account
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
                        Local Development Authentication
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-center">
                            Enter your email
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <label
                                    htmlFor="email"
                                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    Email address
                                </label>
                                <div className="mt-1 relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                                    </div>
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        value={email}
                                        onChange={(e) =>
                                            setEmail(e.target.value)
                                        }
                                        className="pl-10"
                                        placeholder="Enter your email address"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="text-red-600 dark:text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        Signing in...
                                    </>
                                ) : (
                                    <>
                                        <Lock className="h-4 w-4" />
                                        Sign in
                                    </>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <div className="text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        This is a local development authentication simulator.
                        <br />
                        In production, you would be redirected to Microsoft
                        Entra ID.
                    </p>
                </div>
            </div>
        </div>
    );
}
