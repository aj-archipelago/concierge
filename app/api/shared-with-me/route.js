import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../utils/auth";
import Share, { SHARE_ENTITY_TYPES } from "../models/share";
import Chat from "../models/chat.mjs";
import Workspace from "../models/workspace";
import Applet from "../models/applet";
import Automation from "../models/automation";
import Article from "../models/article";

export const dynamic = "force-dynamic";

const TITLE_FETCHERS = {
    chat: async (ids) => {
        const docs = await Chat.find(
            { _id: { $in: ids } },
            { title: 1, updatedAt: 1, userId: 1 },
        ).lean();
        return new Map(
            docs.map((d) => [
                String(d._id),
                { title: d.title, ownerId: d.userId },
            ]),
        );
    },
    workspace: async (ids) => {
        const docs = await Workspace.find(
            { _id: { $in: ids } },
            { name: 1, updatedAt: 1, owner: 1, slug: 1 },
        ).lean();
        return new Map(
            docs.map((d) => [
                String(d._id),
                { title: d.name, slug: d.slug, ownerId: d.owner },
            ]),
        );
    },
    applet: async (ids) => {
        const docs = await Applet.find(
            { _id: { $in: ids } },
            { name: 1, title: 1, owner: 1, updatedAt: 1 },
        ).lean();
        return new Map(
            docs.map((d) => [
                String(d._id),
                {
                    title: d.title || d.name || "Untitled applet",
                    ownerId: d.owner,
                },
            ]),
        );
    },
    automation: async (ids) => {
        const docs = await Automation.find(
            { _id: { $in: ids } },
            { name: 1, owner: 1, updatedAt: 1 },
        ).lean();
        return new Map(
            docs.map((d) => [
                String(d._id),
                { title: d.name, ownerId: d.owner },
            ]),
        );
    },
    article: async (ids) => {
        const docs = await Article.find(
            { _id: { $in: ids } },
            { title: 1, owner: 1, updatedAt: 1 },
        ).lean();
        return new Map(
            docs.map((d) => [
                String(d._id),
                { title: d.title || "Untitled article", ownerId: d.owner },
            ]),
        );
    },
};

export async function GET(req) {
    try {
        const currentUser = await getCurrentUser(false);
        if (!currentUser?._id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const { searchParams } = new URL(req.url);
        const typeParam = searchParams.get("type");
        if (typeParam && !SHARE_ENTITY_TYPES.includes(typeParam)) {
            return NextResponse.json(
                { error: "Invalid type" },
                { status: 400 },
            );
        }

        const query = { "recipients.userId": currentUser._id };
        if (typeParam) query.entityType = typeParam;

        const shares = await Share.find(query)
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean();

        const grouped = new Map();
        for (const s of shares) {
            const list = grouped.get(s.entityType) || [];
            list.push(s);
            grouped.set(s.entityType, list);
        }

        const titlesByType = {};
        await Promise.all(
            [...grouped.entries()].map(async ([type, list]) => {
                const fetcher = TITLE_FETCHERS[type];
                if (!fetcher) return;
                const ids = list.map((s) => s.entityId);
                titlesByType[type] = await fetcher(ids);
            }),
        );

        const results = shares
            .map((s) => {
                const meta = titlesByType[s.entityType]?.get(
                    String(s.entityId),
                );
                if (!meta) return null;
                const myRecipient = (s.recipients || []).find(
                    (r) => String(r.userId) === String(currentUser._id),
                );
                return {
                    entityType: s.entityType,
                    entityId: s.entityId,
                    title: meta.title,
                    slug: meta.slug,
                    ownerId: meta.ownerId,
                    role: myRecipient?.role || "viewer",
                    updatedAt: s.updatedAt,
                };
            })
            .filter(Boolean);

        return NextResponse.json(results);
    } catch (error) {
        return handleError(error);
    }
}
