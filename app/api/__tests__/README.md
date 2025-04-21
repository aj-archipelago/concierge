# API Tests

This directory contains tests for the API routes in the application.

## Admin Protection Tests

The `admin-protection.test.js` file contains tests to verify that all admin-protected API routes reject requests from non-admin users.

### How Admin Protection Works

Admin-protected routes in this application follow a consistent pattern:

1. They use the `getCurrentUser()` function to get the current user
2. They check if the user is an admin with: `if (!currentUser || currentUser.role !== "admin")`
3. If the user is not an admin, they return a 403 Unauthorized response

### Running the Tests

To run the admin protection tests:

```bash
npm test app/api/__tests__/admin-protection.test.js
```

### Adding New Admin-Protected Routes

When adding a new admin-protected route:

1. Follow the standard pattern for admin protection:

    ```javascript
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    ```

2. Add a test for the new route in `admin-protection.test.js`:

    ```javascript
    describe("YOUR_NEW_ROUTE", () => {
        it("should be protected from non-admin users", async () => {
            // Import the route handler
            const { METHOD: routeHandler } = require("../path/to/route");

            // Create mock request and params
            const mockRequest = createMockRequest("METHOD");
            const mockParams = createMockParams("path/to/route");

            // Test the route
            await testAdminProtection(routeHandler, mockRequest, mockParams);
        });
    });
    ```

### Automatically Discovering Admin-Protected Routes

The test file includes a function that automatically discovers admin-protected routes by searching for common patterns in the codebase. This helps ensure that all admin routes are properly tested.

To see all admin-protected routes:

```bash
npm test app/api/__tests__/admin-protection.test.js -- --verbose
```

This will log all discovered admin-protected routes to the console.

### Best Practices

1. Always protect admin routes with the standard pattern
2. Add tests for all new admin-protected routes
3. Run the tests regularly to ensure all admin routes remain protected
4. Consider adding a pre-commit hook to run these tests before committing changes
