import { NextResponse } from "next/server";
import axios from "axios";

export async function POST(request) {
    try {
        const body = await request.json();
        const { grant_type, client_id, client_secret, code, refresh_token, redirect_uri, scope } = body;

        // Validate required parameters
        if (!grant_type || !client_id || !client_secret) {
            return NextResponse.json(
                { error: "Missing required parameters" },
                { status: 400 }
            );
        }

        // Prepare the request payload based on grant type
        const payload = {
            grant_type,
            client_id,
            client_secret,
            scope: scope || "offline_access"
        };

        if (grant_type === "authorization_code") {
            if (!code || !redirect_uri) {
                return NextResponse.json(
                    { error: "Code and redirect_uri are required for authorization_code grant" },
                    { status: 400 }
                );
            }
            payload.code = code;
            payload.redirect_uri = redirect_uri;
        } else if (grant_type === "refresh_token") {
            if (!refresh_token || !redirect_uri) {
                return NextResponse.json(
                    { error: "Refresh token and redirect_uri are required for refresh_token grant" },
                    { status: 400 }
                );
            }
            payload.refresh_token = refresh_token;
            payload.redirect_uri = redirect_uri;
        }

        // Make the request to Atlassian's OAuth endpoint
        const response = await axios.post("https://auth.atlassian.com/oauth/token", payload, {
            headers: {
                "Content-Type": "application/json",
            },
        });

        return NextResponse.json(response.data);
    } catch (error) {
        console.error("Jira OAuth token exchange error:", error.response?.data || error.message);
        
        return NextResponse.json(
            { 
                error: "Token exchange failed",
                details: error.response?.data || error.message 
            },
            { status: error.response?.status || 500 }
        );
    }
} 