import { NextResponse } from "next/server";
import AppletSharedData from "../models/applet-shared-data";
import AppletSharedDataRevision from "../models/applet-shared-data-revision";
import { validateMongoDBKey } from "../utils/fileValidation";

export function validateSharedDataKey(key) {
    const keyValidation = validateMongoDBKey(key);
    if (!keyValidation.isValid) {
        return {
            error: NextResponse.json(
                {
                    error: "Invalid key format",
                    details: keyValidation.errors,
                },
                { status: 400 },
            ),
        };
    }

    return { key: keyValidation.sanitizedKey };
}

export function hasMeaningfulContent(value) {
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "boolean") return true;
    if (Array.isArray(value)) {
        return value.some((item) => hasMeaningfulContent(item));
    }
    if (typeof value === "object") {
        return Object.values(value).some((item) => hasMeaningfulContent(item));
    }
    return false;
}

export function isPlainSharedDataObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function revisionToken(revision) {
    return revision == null ? null : String(revision);
}

export function isRevisionMatch(expectedRevision, currentRevision) {
    return revisionToken(expectedRevision) === revisionToken(currentRevision);
}

export async function createSharedDataBackup({
    existing,
    userId,
    reason = "replace",
}) {
    if (!existing) return null;

    return AppletSharedDataRevision.create({
        appletId: existing.appletId,
        key: existing.key,
        revision: existing.revision,
        value: existing.value,
        reason,
        createdBy: userId,
    });
}

export function sharedDataQuery({ appletId, key }) {
    return { appletId, key };
}

export async function loadSharedData({ appletId, key }) {
    return AppletSharedData.findOne(sharedDataQuery({ appletId, key }));
}

export async function createSharedData({ appletId, key, value, userId }) {
    return AppletSharedData.create({
        appletId,
        key,
        value,
        revision: 1,
        createdBy: userId,
        updatedBy: userId,
    });
}

export async function replaceSharedData({ existing, value, userId }) {
    const nextRevision = Number(existing.revision || 0) + 1;

    return AppletSharedData.findOneAndUpdate(
        {
            appletId: existing.appletId,
            key: existing.key,
            revision: existing.revision,
        },
        {
            $set: {
                value,
                revision: nextRevision,
                updatedBy: userId,
            },
        },
        {
            new: true,
            runValidators: true,
        },
    );
}
