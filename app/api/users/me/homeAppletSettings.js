import mongoose from "mongoose";
import User from "../../models/user.mjs";

const MAX_HOME_APPLET_DIRECTORY_ITEMS = 48;
const MAX_HOME_ITEMS = 96;
const HOME_ITEM_TYPES = new Set(["digest", "automation", "applet", "group"]);
const HOME_ITEM_SIZES = new Set(["mini", "large"]);

function toObjectId(value) {
    if (!value || !mongoose.Types.ObjectId.isValid(value)) {
        return null;
    }
    return new mongoose.Types.ObjectId(value);
}

export function toHomeAppletIdString(value) {
    if (!value) return null;
    if (typeof value === "object" && value.$oid) return String(value.$oid);
    if (typeof value === "object" && value._id && value._id !== value)
        return toHomeAppletIdString(value._id);
    return value.toString?.() || String(value);
}

function normalizeDirectoryEntries(entries = []) {
    const seen = new Set();
    return (Array.isArray(entries) ? entries : [])
        .map((entry, index) => {
            const appletId = toHomeAppletIdString(entry?.appletId || entry);
            if (!appletId || seen.has(appletId)) return null;
            seen.add(appletId);
            const order = Number.isFinite(entry?.order) ? entry.order : index;
            return {
                appletId,
                order,
                addedAt: entry?.addedAt || null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.order - b.order)
        .slice(0, MAX_HOME_APPLET_DIRECTORY_ITEMS)
        .map((entry, index) => ({
            ...entry,
            order: index,
        }));
}

function normalizeHomeItems(items = []) {
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
        .map((item, index) => {
            const type = String(item?.type || "").trim();
            if (!HOME_ITEM_TYPES.has(type)) return null;

            const groupId = item?.groupId ? String(item.groupId).trim() : null;
            const title = item?.title ? String(item.title).trim() : null;
            const blockId = item?.blockId ? String(item.blockId) : null;
            const automationId = toHomeAppletIdString(item?.automationId);
            const appletId = toHomeAppletIdString(item?.appletId);
            const key =
                type === "group"
                    ? `${type}:${groupId || ""}`
                    : type === "applet"
                      ? `${type}:${appletId || ""}`
                      : `${type}:${blockId || automationId || ""}`;
            if (
                seen.has(key) ||
                (type === "group" && !groupId) ||
                (type === "applet" && !appletId) ||
                (!["applet", "group"].includes(type) &&
                    !blockId &&
                    !automationId)
            ) {
                return null;
            }
            seen.add(key);

            const order = Number.isFinite(item?.order) ? item.order : index;
            const size = HOME_ITEM_SIZES.has(item?.size) ? item.size : "large";
            return {
                type,
                groupId,
                title: type === "group" ? title || "Group" : null,
                blockId,
                automationId,
                appletId,
                size: type === "group" ? "large" : size,
                order,
                addedAt: item?.addedAt || null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.order - b.order)
        .slice(0, MAX_HOME_ITEMS)
        .map((item, index) => ({
            ...item,
            order: index,
        }));
}

function toStoredHomeItems(items = []) {
    return normalizeHomeItems(items)
        .map((item) => ({
            type: item.type,
            ...(item.groupId ? { groupId: item.groupId } : {}),
            ...(item.title ? { title: item.title } : {}),
            ...(item.blockId ? { blockId: item.blockId } : {}),
            ...(toObjectId(item.automationId)
                ? { automationId: toObjectId(item.automationId) }
                : {}),
            ...(toObjectId(item.appletId)
                ? { appletId: toObjectId(item.appletId) }
                : {}),
            size: item.size,
            order: item.order,
            addedAt: item.addedAt || new Date(),
        }))
        .filter((item) => item.type !== "applet" || Boolean(item.appletId));
}

function toStoredDirectory(entries = []) {
    return normalizeDirectoryEntries(entries)
        .map((entry) => {
            const appletId = toObjectId(entry.appletId);
            if (!appletId) return null;
            return {
                appletId,
                order: entry.order,
                addedAt: entry.addedAt || new Date(),
            };
        })
        .filter(Boolean);
}

async function writeHomeAppletDirectoryForUser(user, entries) {
    const userId = toObjectId(user?._id);
    if (!userId) return [];

    const homeAppletDirectory = toStoredDirectory(entries);
    await User.collection.updateOne(
        { _id: userId },
        { $set: { homeAppletDirectory } },
    );
    return normalizeDirectoryEntries(homeAppletDirectory);
}

export async function readHomeAppletIdForUser(user) {
    const userId = toObjectId(user?._id);
    if (!userId) return null;

    const doc = await User.collection.findOne(
        { _id: userId },
        { projection: { homeAppletId: 1 } },
    );
    return toHomeAppletIdString(doc?.homeAppletId);
}

export async function readHomeAppletDirectoryForUser(user) {
    const userId = toObjectId(user?._id);
    if (!userId) return [];

    const doc = await User.collection.findOne(
        { _id: userId },
        { projection: { homeAppletDirectory: 1 } },
    );
    return normalizeDirectoryEntries(doc?.homeAppletDirectory);
}

export async function readHomeAppletDirectoryIdsForUser(user) {
    const entries = await readHomeAppletDirectoryForUser(user);
    return entries.map((entry) => entry.appletId);
}

export async function readHomeItemsForUser(user) {
    const userId = toObjectId(user?._id);
    if (!userId) return { items: [], configured: false };

    const doc = await User.collection.findOne(
        { _id: userId },
        {
            projection: {
                homeItems: 1,
                homeItemsConfigured: 1,
                homeItemsDefaultGroupMigrated: 1,
            },
        },
    );
    return {
        items: normalizeHomeItems(doc?.homeItems),
        configured: Boolean(doc?.homeItemsConfigured),
        defaultGroupMigrated: Boolean(doc?.homeItemsDefaultGroupMigrated),
    };
}

export async function setHomeAppletIdForUser(user, appletId) {
    const userId = toObjectId(user?._id);
    const homeAppletId = toObjectId(appletId);
    if (!userId || !homeAppletId) {
        const error = new Error("Invalid applet ID");
        error.status = 400;
        throw error;
    }

    await User.collection.updateOne(
        { _id: userId },
        { $set: { homeAppletId } },
    );
    return toHomeAppletIdString(homeAppletId);
}

export async function addHomeAppletDirectoryItemForUser(user, appletId) {
    const directoryAppletId = toObjectId(appletId);
    if (!directoryAppletId) {
        const error = new Error("Invalid applet ID");
        error.status = 400;
        throw error;
    }

    const appletIdString = toHomeAppletIdString(directoryAppletId);
    const homeItems = await readHomeItemsForUser(user);
    if (homeItems.configured) {
        if (
            homeItems.items.some(
                (item) =>
                    item.type === "applet" && item.appletId === appletIdString,
            )
        ) {
            return readHomeAppletDirectoryForUser(user);
        }

        await setHomeItemsForUser(user, [
            ...homeItems.items,
            {
                type: "applet",
                appletId: appletIdString,
                size: "large",
                order: homeItems.items.length,
                addedAt: new Date(),
            },
        ]);
        return readHomeAppletDirectoryForUser(user);
    }

    const current = await readHomeAppletDirectoryForUser(user);
    if (current.some((entry) => entry.appletId === appletIdString)) {
        return current;
    }

    return writeHomeAppletDirectoryForUser(user, [
        ...current,
        {
            appletId: appletIdString,
            order: current.length,
            addedAt: new Date(),
        },
    ]);
}

export async function removeHomeAppletDirectoryItemForUser(user, appletId) {
    const appletIdString = toHomeAppletIdString(appletId);
    if (!appletIdString) return readHomeAppletDirectoryForUser(user);

    const homeItems = await readHomeItemsForUser(user);
    if (homeItems.configured) {
        await setHomeItemsForUser(
            user,
            homeItems.items.filter(
                (item) =>
                    item.type !== "applet" || item.appletId !== appletIdString,
            ),
        );
        return readHomeAppletDirectoryForUser(user);
    }

    const current = await readHomeAppletDirectoryForUser(user);
    return writeHomeAppletDirectoryForUser(
        user,
        current.filter((entry) => entry.appletId !== appletIdString),
    );
}

export async function setHomeAppletDirectoryOrderForUser(user, appletIds = []) {
    const currentById = new Map(
        (await readHomeAppletDirectoryForUser(user)).map((entry) => [
            entry.appletId,
            entry,
        ]),
    );
    const nextEntries = [];
    const seen = new Set();

    for (const appletId of Array.isArray(appletIds) ? appletIds : []) {
        const appletIdString = toHomeAppletIdString(appletId);
        if (!appletIdString || seen.has(appletIdString)) continue;
        seen.add(appletIdString);
        const currentEntry = currentById.get(appletIdString);
        nextEntries.push({
            appletId: appletIdString,
            order: nextEntries.length,
            addedAt: currentEntry?.addedAt || new Date(),
        });
    }

    return writeHomeAppletDirectoryForUser(user, nextEntries);
}

export async function setHomeItemsForUser(user, items = []) {
    const userId = toObjectId(user?._id);
    if (!userId) return [];

    const homeItems = toStoredHomeItems(items);
    const homeAppletDirectory = toStoredDirectory(
        homeItems
            .filter((item) => item.type === "applet" && item.appletId)
            .map((item, index) => ({
                appletId: item.appletId,
                order: index,
                addedAt: item.addedAt,
            })),
    );

    await User.collection.updateOne(
        { _id: userId },
        {
            $set: {
                homeItems,
                homeItemsConfigured: true,
                homeItemsDefaultGroupMigrated: true,
                homeAppletDirectory,
            },
        },
    );
    return normalizeHomeItems(homeItems);
}

export async function clearHomeAppletIdForUser(user) {
    const userId = toObjectId(user?._id);
    if (!userId) return;

    await User.collection.updateOne(
        { _id: userId },
        { $unset: { homeAppletId: "" } },
    );
}
