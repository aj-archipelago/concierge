/** Only a terminal completion is safe to save. A disconnected stream may contain partial HTML. */
export async function readAppletGenerationStream(response, t = (key) => key) {
    if (!response.ok || !response.body) throw new Error(t("Generation failed"));
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const readBlock = (block) => {
        const line = block
            .split(/\r?\n/)
            .find((value) => value.startsWith("data: "));
        if (!line) return null;
        let payload;
        try {
            payload = JSON.parse(line.slice(6));
        } catch {
            return null;
        }
        if (payload?.event === "error")
            throw new Error(
                payload.data?.error || t("Applet generation failed"),
            );
        if (
            payload?.event === "complete" &&
            typeof payload.data?.html === "string" &&
            payload.data.html.trim()
        )
            return payload.data.html;
        return null;
    };
    try {
        while (true) {
            const { done, value } = await reader.read();
            buffer += done
                ? decoder.decode()
                : decoder.decode(value, { stream: true });
            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() || "";
            if (done) blocks.push(buffer);
            for (const block of blocks) {
                const html = readBlock(block);
                if (html) return html;
            }
            if (done)
                throw new Error(
                    t("Applet generation stream ended before completion"),
                );
        }
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}
