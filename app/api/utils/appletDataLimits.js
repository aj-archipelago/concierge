import { NextResponse } from "next/server";
import { BSON } from "mongodb";

export const APPLET_DATA_VALUE_MAX_BYTES = 2 * 1024 * 1024;
// Cosmos limits the stored BSON document, not its JSON representation. Leave
// room for IDs, timestamps, the key, and future document metadata.
const DOCUMENT_METADATA_RESERVE_BYTES = 16 * 1024;

export function getJsonByteSize(value) {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
    if (bytes >= 1024) {
        return `${Math.ceil(bytes / 1024)}KB`;
    }
    return `${bytes} bytes`;
}

export function validateAppletDataPayload({ key, value }) {
    const valueBytes = getJsonByteSize(value);
    const storageBytes = BSON.calculateObjectSize({ value, key });
    const storageMaxBytes =
        APPLET_DATA_VALUE_MAX_BYTES - DOCUMENT_METADATA_RESERVE_BYTES;
    if (
        valueBytes > APPLET_DATA_VALUE_MAX_BYTES ||
        storageBytes > storageMaxBytes
    ) {
        return {
            ok: false,
            response: NextResponse.json(
                {
                    error: `Applet data value "${key}" is too large for storage. Store large datasets in applet files, applet-user files, or another purpose-built store instead of ConciergeSDK.data.`,
                    code: "APPLET_DATA_VALUE_TOO_LARGE",
                    key,
                    actualBytes: valueBytes,
                    maxBytes: APPLET_DATA_VALUE_MAX_BYTES,
                    storageBytes,
                    storageMaxBytes,
                    actualSize: formatBytes(valueBytes),
                    maxSize: formatBytes(APPLET_DATA_VALUE_MAX_BYTES),
                },
                { status: 413 },
            ),
        };
    }
    return { ok: true, valueBytes };
}
