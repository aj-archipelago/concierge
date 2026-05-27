/**
 * @jest-environment node
 */

import fs from "fs";
import path from "path";

describe("MCP credential CSFLE schema", () => {
    it("keeps user MCP credential fields in the Mongo schema map", () => {
        const dbSource = fs.readFileSync(
            path.join(process.cwd(), "src/db.mjs"),
            "utf8",
        );

        expect(dbSource).toMatch(
            /\[`\$\{dbName\}\.users`\]:[\s\S]*mcpServers:[\s\S]*bsonType: "object"[\s\S]*algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random"/,
        );
        expect(dbSource).toMatch(
            /\[`\$\{dbName\}\.users`\]:[\s\S]*mcpOAuthPending:[\s\S]*bsonType: "object"[\s\S]*algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random"/,
        );
    });
});
