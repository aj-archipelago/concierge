# Authentication Token Expiration Solution

## Problem

Users leaving the app open overnight experienced authentication token expiration, causing API calls to fail and making the app appear unresponsive.

## Solution Overview

This solution implements a robust authentication refresh mechanism that:

1. **Proactively checks authentication status** before making API calls
2. **Handles Azure App Service authentication properly** using the `.auth/login/aad` endpoint
3. **Provides better user experience** with loading states and error dialogs
4. **Implements proper token refresh logic** with request queuing

## Key Components

### 1. Enhanced Axios Client (`app/utils/axios-client.js`)

- **Request Interceptor**: Checks authentication status before each request
- **Response Interceptor**: Handles 401 errors and authentication redirects
- **Request Queuing**: Prevents multiple simultaneous auth refresh attempts
- **Azure App Service Integration**: Uses proper Azure auth endpoints

### 2. Enhanced GraphQL Client (`src/graphql.js`)

- **Error Handling**: Detects authentication errors in GraphQL responses
- **Consistent Auth Flow**: Uses the same authentication refresh mechanism as axios

### 3. Authentication Provider (`src/components/AuthProvider.js`)

- **State Management**: Tracks authentication status and loading states
- **Auth Flow Handling**: Manages the complete authentication refresh process
- **URL Management**: Handles auth redirects and URL cleanup

### 4. User Interface Components

- **AuthErrorDialog**: Shows authentication errors with refresh options
- **AuthLoadingOverlay**: Displays loading state during authentication
- **Consistent Styling**: Uses existing AlertDialog patterns and Lucide icons

### 5. API Endpoint (`app/api/auth/status/route.js`)

- **Lightweight Status Check**: Provides fast authentication status verification
- **HEAD Method Support**: Optimized for quick auth checks without full response

## How It Works

### Proactive Authentication Checking

1. Before each API request, the system checks if the user is authenticated
2. Uses a lightweight HEAD request to `/api/auth/status`
3. If authentication fails, triggers the refresh flow before the main request

### Azure App Service Authentication Refresh

1. Redirects to `/.auth/login/aad` with the current URL as the post-login redirect
2. Stores the current URL in sessionStorage for return after authentication
3. Azure handles the Entra ID authentication flow
4. User is redirected back to the original page after successful authentication

### Error Handling

1. **401 Errors**: Automatically trigger authentication refresh
2. **HTML Responses**: Detect authentication redirects and handle appropriately
3. **Request Queuing**: Prevent multiple simultaneous refresh attempts
4. **User Feedback**: Show loading states and error dialogs

### Request Queuing

- When authentication refresh is in progress, new requests are queued
- After successful authentication, queued requests are automatically retried
- Prevents race conditions and multiple auth refresh attempts

## Usage

### In Components

```javascript
import { useAuthError } from "../hooks/useAuthError";

const MyComponent = () => {
    const { handleAuthError } = useAuthError();

    const handleApiCall = async () => {
        try {
            const response = await axios.get("/api/some-endpoint");
            // Handle success
        } catch (error) {
            if (!handleAuthError(error)) {
                // Handle other errors
            }
        }
    };
};
```

### Automatic Handling

Most API calls will automatically handle authentication errors through the axios and GraphQL interceptors. No additional code is needed for basic authentication error handling.

## Configuration

### Azure App Service

Ensure your Azure App Service is configured with:

- **Authentication/Authorization** enabled
- **Azure Active Directory** as the identity provider
- **Redirect URI** configured to include your app's domain

### Environment Variables

No additional environment variables are required. The solution uses existing Azure App Service authentication configuration.

## Benefits

1. **Improved User Experience**: Users see clear feedback during authentication
2. **Reduced API Failures**: Proactive authentication checking prevents failed requests
3. **Consistent Behavior**: Same authentication flow across all API calls
4. **Better Error Handling**: Graceful degradation and clear error messages
5. **Automatic Recovery**: Seamless authentication refresh without user intervention

## Testing

### Local Development Testing

#### Option 1: Using the Test Page (Recommended)

1. Navigate to `/test-auth` in your local development environment
2. Use the Authentication Test Panel to:
    - Check current authentication status
    - Clear mock authentication to simulate token expiration
    - Test API calls that trigger authentication refresh
    - Manually trigger authentication refresh

#### Option 2: Manual Testing

1. Open the app in your browser
2. Open browser developer tools and go to Application/Storage tab
3. Clear the `mock-auth` cookie to simulate token expiration
4. Try to perform an action that requires authentication (like making an API call)
5. Watch the authentication refresh flow in action

#### Option 3: Simulating Token Expiration

1. In browser developer tools, go to Application/Storage
2. Find the `mock-auth` cookie and delete it
3. Refresh the page or make an API call
4. Observe the authentication refresh process

### Production Testing (Azure App Service)

1. Deploy the app to Azure App Service
2. Open the app and leave it open overnight
3. Try to perform an action that requires authentication
4. Verify that authentication refresh occurs automatically
5. Check that the user is redirected back to the original page

### Testing Scenarios

#### Scenario 1: Fresh Authentication

1. Clear all authentication cookies
2. Navigate to any page that requires authentication
3. Should redirect to mock auth endpoint
4. Should return to original page with authentication

#### Scenario 2: Token Expiration

1. Start with valid authentication
2. Clear the `mock-auth` cookie
3. Make an API call
4. Should trigger authentication refresh automatically
5. Should complete the call after successful authentication

#### Scenario 3: Multiple Concurrent Requests

1. Clear authentication
2. Make multiple API calls simultaneously
3. Should queue requests during authentication
4. Should process all requests after authentication completes

### Automated Testing

The solution includes proper error handling that can be tested with:

- Network error simulation
- Authentication failure scenarios
- Request queuing behavior

## Troubleshooting

### Common Issues

1. **Infinite Redirect Loops**: Check that auth endpoints are excluded from authentication checks
2. **Missing Headers**: Ensure Azure App Service authentication is properly configured
3. **Session Storage Issues**: Verify that sessionStorage is available in the browser

### Debugging

- Check browser network tab for authentication requests
- Monitor console for authentication-related errors
- Verify Azure App Service authentication logs
