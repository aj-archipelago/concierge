import { NextResponse } from "next/server";
import axios from "axios";

export async function GET(request) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const token = searchParams.get("token");

        if (!token) {
            return NextResponse.json(
                { error: "Token is required" },
                { status: 400 }
            );
        }

        // Make the request to Atlassian's API
        const response = await axios.get("https://api.atlassian.com/oauth/token/accessible-resources", {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
            },
        });

        return NextResponse.json(response.data);
    } catch (error) {
        console.error("Jira accessible resources error:", error.response?.data || error.message);
        
        return NextResponse.json(
            { 
                error: "Failed to get accessible resources",
                details: error.response?.data || error.message 
            },
            { status: error.response?.status || 500 }
        );
    }
} 