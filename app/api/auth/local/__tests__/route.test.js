/**
 * @jest-environment node
 */

import { GET, POST } from "../route";

describe("GET /api/auth/local", () => {
    it("forwards a same-origin post-login redirect to the login page", async () => {
        const request = new Request(
            "http://localhost:3000/api/auth/local?post_login_redirect_url=http://localhost:3000/chat/new",
        );
        const response = await GET(request);

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "http://localhost:3000/auth/login?redirect_uri=%2Fchat%2Fnew",
        );
    });

    it("drops external post-login redirects", async () => {
        const request = new Request(
            "http://localhost:3000/api/auth/local?post_login_redirect_url=https://evil.example/phish",
        );
        const response = await GET(request);

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "http://localhost:3000/auth/login?redirect_uri=%2F",
        );
    });
});

describe("POST /api/auth/local", () => {
    it("sanitizes redirect_uri in the JSON response", async () => {
        const request = new Request("http://localhost:3000/api/auth/local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: "dev@example.com",
                redirect_uri: "https://evil.example/phish",
            }),
        });
        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.redirect_uri).toBe("/");
    });
});
