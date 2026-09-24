/** @jest-environment node */
import { ReadableStream } from "node:stream/web";
import { readAppletGenerationStream } from "../readAppletGenerationStream";

function response(chunks) {
    const encoder = new TextEncoder();
    return {
        ok: true,
        body: new ReadableStream({
            start(controller) {
                for (const chunk of chunks)
                    controller.enqueue(encoder.encode(chunk));
                controller.close();
            },
        }),
    };
}

test("rejects disconnected HTML instead of saving a partial applet", async () => {
    await expect(
        readAppletGenerationStream(
            response([
                'data: {"event":"data","data":{"chunk":"<html>unfinished"}}\n\n',
            ]),
        ),
    ).rejects.toThrow("before completion");
});

test("requires successful completion even if data chunks resemble a document", async () => {
    await expect(
        readAppletGenerationStream(
            response([
                'data: {"event":"data","data":{"chunk":"<html>partial</html>"}}\n\n',
                'data: {"event":"error","data":{"error":"Rejected"}}\n\n',
            ]),
        ),
    ).rejects.toThrow("Rejected");
});

test("reads split terminal events, CRLF, and a final event without a separator", async () => {
    const result = await readAppletGenerationStream(
        response([
            ': keepalive\r\n\r\ndata: {"event":"comp',
            'lete","data":{"html":"<html>complete</html>"}}',
        ]),
    );
    expect(result).toBe("<html>complete</html>");
});
