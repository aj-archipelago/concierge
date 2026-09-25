/**
 * @jest-environment node
 */

import fs from "fs";
import path from "path";

describe("chat CSFLE schema", () => {
    it("encrypts chat content stored in header previews", () => {
        const dbSource = fs.readFileSync(
            path.join(process.cwd(), "src/db.mjs"),
            "utf8",
        );

        expect(dbSource).toMatch(
            /\[`\$\{dbName\}\.chats`\]:[\s\S]*lastMessagePreview:[\s\S]*bsonType: "string"[\s\S]*algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random"/,
        );
    });
});
