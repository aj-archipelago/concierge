import { getCurrentUser, handleError } from "../../utils/auth";
import {
    getClient,
    SYS_ENTITY_UPDATE,
    SYS_GET_ENTITIES,
} from "../../../../src/graphql";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_REASONING_EFFORTS = ["none", "low", "medium", "high"];
const UPPER_SNAKE_CASE = /^[A-Z_][A-Z0-9_]*$/;
const NO_STORE_HEADERS = {
    "Cache-Control": "no-store, max-age=0, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
};

function jsonNoStore(body, init = {}) {
    return Response.json(body, {
        ...init,
        headers: {
            ...NO_STORE_HEADERS,
            ...(init.headers || {}),
        },
    });
}

export async function GET(req, { params }) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
        }

        const { entityId } = params;
        if (!entityId) {
            return jsonNoStore(
                { error: "entityId is required" },
                { status: 400 },
            );
        }

        // Use SYS_GET_ENTITIES to fetch entity metadata (including secretKeys).
        // SYS_ENTITY_UPDATE only returns {success:true} when called without
        // update params, so it can't be used for reads.
        const client = getClient();
        const { data } = await client.query({
            query: SYS_GET_ENTITIES,
            variables: { userId: user.contextId, fresh: "true" },
            fetchPolicy: "network-only",
        });

        const entities = JSON.parse(data.sys_get_entities.result);
        const entity = entities.find((e) => e.id === entityId);

        if (!entity) {
            return jsonNoStore({ error: "Entity not found" }, { status: 404 });
        }

        return jsonNoStore(entity);
    } catch (error) {
        return handleError(error);
    }
}

export async function PATCH(req, { params }) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
        }

        const { entityId } = params;
        if (!entityId) {
            return jsonNoStore(
                { error: "entityId is required" },
                { status: 400 },
            );
        }

        const body = await req.json();
        const { name, secrets, reasoningEffort } = body;

        if (name !== undefined && !String(name).trim()) {
            return jsonNoStore(
                { error: "name cannot be empty" },
                { status: 400 },
            );
        }

        // Validate reasoningEffort
        if (
            reasoningEffort !== undefined &&
            !VALID_REASONING_EFFORTS.includes(reasoningEffort)
        ) {
            return jsonNoStore(
                {
                    error: `Invalid reasoningEffort. Must be one of: ${VALID_REASONING_EFFORTS.join(", ")}`,
                },
                { status: 400 },
            );
        }

        // Validate secret names
        if (secrets) {
            for (const key of Object.keys(secrets)) {
                if (!UPPER_SNAKE_CASE.test(key)) {
                    return jsonNoStore(
                        {
                            error: `Invalid secret name "${key}". Must be UPPER_SNAKE_CASE.`,
                        },
                        { status: 400 },
                    );
                }
            }
        }

        const variables = {
            entityId,
            contextId: user.contextId,
        };

        if (secrets) {
            variables.secrets = JSON.stringify(secrets);
        }
        if (name !== undefined) {
            variables.name = String(name).trim();
        }
        if (reasoningEffort !== undefined) {
            variables.reasoningEffort = reasoningEffort;
        }

        const client = getClient();
        const { data } = await client.query({
            query: SYS_ENTITY_UPDATE,
            variables,
            fetchPolicy: "network-only",
        });

        const result = JSON.parse(data.sys_entity_update.result);
        if (result.error) {
            return jsonNoStore({ error: result.error }, { status: 400 });
        }

        return jsonNoStore(result);
    } catch (error) {
        return handleError(error);
    }
}
