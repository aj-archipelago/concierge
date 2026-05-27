import { NextResponse } from "next/server";

function isInvalidJsonError(error) {
    return (
        error?.name === "SyntaxError" ||
        /json|unexpected end of input/i.test(error?.message || "")
    );
}

export async function parseJsonRequest(
    request,
    { invalidMessage = "Invalid or empty JSON body" } = {},
) {
    try {
        return {
            ok: true,
            body: await request.json(),
        };
    } catch (error) {
        if (isInvalidJsonError(error)) {
            return {
                ok: false,
                errorResponse: NextResponse.json(
                    { error: invalidMessage },
                    { status: 400 },
                ),
            };
        }

        throw error;
    }
}
