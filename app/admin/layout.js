import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../api/utils/auth";
import AdminNav from "./components/AdminNav";

export default async function AdminLayout({ children }) {
    const user = await getCurrentUser();

    if (!user || user.role !== "admin") {
        redirect("/");
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <nav className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex">
                            <AdminNav />
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                {children}
            </main>
        </div>
    );
}
