import { getCurrentUser } from "../../../app/api/utils/auth";
import User from "../../../app/api/models/user";
import UserManagementClient from "./UserManagementClient";

export default async function UsersPage({ searchParams }) {
    const page = parseInt(searchParams.page) || 1;
    const limit = parseInt(searchParams.limit) || 10;
    const search = searchParams.search || "";

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Create search query
    const searchQuery = search
        ? {
              $or: [
                  { name: { $regex: search, $options: "i" } },
                  { username: { $regex: search, $options: "i" } },
              ],
          }
        : {};

    // Get total count for pagination
    const totalUsers = await User.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalUsers / limit);

    // Fetch paginated users
    const users = await User.find(searchQuery, "-__v")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

    const currentUser = await getCurrentUser();

    return (
        <UserManagementClient
            initialUsers={users}
            currentUser={currentUser}
            totalPages={totalPages}
            currentPage={page}
            search={search}
        />
    );
}
