"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UserManagementClient({
    initialUsers,
    currentUser,
    totalPages,
    currentPage,
    search: initialSearch,
}) {
    const [users, setUsers] = useState(initialUsers);
    const [search, setSearch] = useState(initialSearch || "");
    const [isSearching, setIsSearching] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    // Update users when initialUsers changes (from server-side)
    useEffect(() => {
        setUsers(initialUsers);
    }, [initialUsers]);

    const handleRoleChange = async (userId, newRole) => {
        try {
            const response = await fetch(`/api/users/${userId}/role`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ role: newRole }),
            });

            if (response.ok) {
                setUsers(
                    users.map((user) =>
                        user._id === userId ? { ...user, role: newRole } : user,
                    ),
                );
            } else {
                console.error("Failed to update user role");
            }
        } catch (error) {
            console.error("Error updating user role:", error);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        setIsSearching(true);

        // Create new URLSearchParams object
        const params = new URLSearchParams(searchParams);

        // Update search parameter
        if (search) {
            params.set("search", search);
        } else {
            params.delete("search");
        }

        // Reset to page 1 when searching
        params.set("page", "1");

        // Navigate to the new URL
        router.push(`/admin/users?${params.toString()}`);

        // Reset searching state
        setIsSearching(false);
    };

    const handlePageChange = (newPage) => {
        if (newPage < 1 || newPage > totalPages) return;

        // Create new URLSearchParams object
        const params = new URLSearchParams(searchParams);

        // Update page parameter
        params.set("page", newPage.toString());

        // Navigate to the new URL
        router.push(`/admin/users?${params.toString()}`);
    };

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-6">User Management</h1>

            {/* Search Form */}
            <div className="mb-6">
                <form onSubmit={handleSearch} className="flex gap-2">
                    <Input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name or username..."
                        className="flex-grow"
                    />
                    <Button type="submit" disabled={isSearching}>
                        {isSearching ? "Searching..." : "Search"}
                    </Button>
                </form>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto mb-6">
                <table className="min-w-full bg-background border border-border rounded-md">
                    <thead>
                        <tr className="bg-muted">
                            <th className="px-6 py-3 border-b border-border text-left text-muted-foreground text-sm font-medium">
                                Name
                            </th>
                            <th className="px-6 py-3 border-b border-border text-left text-muted-foreground text-sm font-medium">
                                Username
                            </th>
                            <th className="px-6 py-3 border-b border-border text-left text-muted-foreground text-sm font-medium">
                                Role
                            </th>
                            <th className="px-6 py-3 border-b border-border text-left text-muted-foreground text-sm font-medium">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.length > 0 ? (
                            users.map((user) => (
                                <tr
                                    key={user._id}
                                    className="hover:bg-muted/50"
                                >
                                    <td className="px-6 py-4 border-b border-border">
                                        {user.name}
                                    </td>
                                    <td className="px-6 py-4 border-b border-border">
                                        {user.username}
                                    </td>
                                    <td className="px-6 py-4 border-b border-border">
                                        {user.role}
                                    </td>
                                    <td className="px-6 py-4 border-b border-border">
                                        <Select
                                            value={user.role}
                                            onValueChange={(value) =>
                                                handleRoleChange(
                                                    user._id,
                                                    value,
                                                )
                                            }
                                            disabled={
                                                user._id === currentUser._id
                                            }
                                        >
                                            <SelectTrigger className="w-[120px]">
                                                <SelectValue placeholder="Select role" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="user">
                                                    User
                                                </SelectItem>
                                                <SelectItem value="admin">
                                                    Admin
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td
                                    colSpan="4"
                                    className="px-6 py-4 text-center text-muted-foreground"
                                >
                                    No users found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious
                                onClick={() =>
                                    handlePageChange(currentPage - 1)
                                }
                                disabled={currentPage === 1}
                                className="cursor-pointer"
                            />
                        </PaginationItem>

                        {Array.from(
                            { length: totalPages },
                            (_, i) => i + 1,
                        ).map((page) => (
                            <PaginationItem key={page}>
                                <PaginationLink
                                    onClick={() => handlePageChange(page)}
                                    isActive={currentPage === page}
                                    className="cursor-pointer"
                                >
                                    {page}
                                </PaginationLink>
                            </PaginationItem>
                        ))}

                        <PaginationItem>
                            <PaginationNext
                                onClick={() =>
                                    handlePageChange(currentPage + 1)
                                }
                                disabled={currentPage === totalPages}
                                className="cursor-pointer"
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}
        </div>
    );
}
