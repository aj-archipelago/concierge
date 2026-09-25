import { parse as parseJavaScript } from "acorn";
import { parse as parseHtml } from "parse5";

function unwrap(node) {
    return node?.type === "ChainExpression" ? node.expression : node;
}

function member(node, property) {
    node = unwrap(node);
    return node?.type === "MemberExpression" &&
        !node.computed &&
        node.property?.name === property
        ? unwrap(node.object)
        : null;
}

function identifier(node, name) {
    return node?.type === "Identifier" && node.name === name;
}

function sdkCall(node, namespace, method) {
    node = unwrap(node);
    if (node?.type !== "CallExpression") return false;
    const sdk = member(member(node.callee, method), namespace);
    return (
        identifier(sdk, "ConciergeSDK") ||
        identifier(member(sdk, "ConciergeSDK"), "window")
    );
}

function walk(node, visit) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
        for (const child of node) walk(child, visit);
        return;
    }
    if (!node.type) return;
    visit(node);
    for (const value of Object.values(node)) walk(value, visit);
}

function singleDeclaration(statement) {
    return statement?.type === "VariableDeclaration" &&
        statement.declarations.length === 1 &&
        statement.declarations[0].id.type === "Identifier"
        ? statement.declarations[0]
        : null;
}

function backgroundFallback(statement, urlName) {
    // The generated example, and variants with extra availability guards,
    // start with `if (!url)` before calling media.createImage.
    if (statement?.type !== "IfStatement") return false;
    let test = statement.test;
    while (test?.type === "LogicalExpression" && test.operator === "&&") {
        test = test.left;
    }
    if (
        test?.type !== "UnaryExpression" ||
        test.operator !== "!" ||
        !identifier(test.argument, urlName)
    ) {
        return false;
    }
    let generatesImage = false;
    walk(statement.consequent, (node) => {
        if (sdkCall(node, "media", "createImage")) generatesImage = true;
    });
    return generatesImage;
}

function literalOptions(node) {
    if (node?.type === "Literal") return true;
    return (
        node?.type === "ObjectExpression" &&
        node.properties.every(
            (property) =>
                property.type === "Property" &&
                !property.computed &&
                !property.method &&
                property.kind === "init" &&
                literalOptions(property.value),
        )
    );
}

function imageSequence(statement, urlName, key) {
    const body = statement.consequent?.body;
    if (!Array.isArray(body) || body.length !== 4) return null;
    const started = singleDeclaration(body[0]);
    const task = singleDeclaration(body[1]);
    const create = unwrap(started?.init?.argument);
    const wait = unwrap(task?.init?.argument);
    if (
        started?.init?.type !== "AwaitExpression" ||
        !sdkCall(create, "media", "createImage") ||
        create.arguments.length !== 1 ||
        !literalOptions(create.arguments[0]) ||
        task?.init?.type !== "AwaitExpression" ||
        !sdkCall(wait, "tasks", "wait") ||
        wait.arguments.length !== 1 ||
        !identifier(member(wait.arguments[0], "taskId"), started.id.name)
    )
        return null;
    const assignment = body[2]?.expression;
    function outputMembers(node) {
        return node?.type === "LogicalExpression" && node.operator === "||"
            ? [...outputMembers(node.left), ...outputMembers(node.right)]
            : [node];
    }
    const members = outputMembers(assignment?.right);
    if (
        assignment?.type !== "AssignmentExpression" ||
        assignment.operator !== "=" ||
        !identifier(assignment.left, urlName) ||
        members.length !== 3 ||
        !["azureUrl", "url", "gcsUrl"].every((property, index) =>
            identifier(
                member(member(members[index], property), "data"),
                task.id.name,
            ),
        )
    )
        return null;
    const condition = body[3];
    const saveStatement =
        condition.consequent?.type === "BlockStatement"
            ? condition.consequent.body.length === 1
                ? condition.consequent.body[0]
                : null
            : condition.consequent;
    const save = unwrap(saveStatement?.expression?.argument);
    const value = save?.arguments?.[1];
    if (
        condition.type !== "IfStatement" ||
        condition.alternate ||
        !identifier(condition.test, urlName) ||
        saveStatement?.expression?.type !== "AwaitExpression" ||
        !sdkCall(save, "data", "set") ||
        save.arguments.length !== 2 ||
        save.arguments[0].type !== "Literal" ||
        save.arguments[0].value !== key ||
        value?.type !== "ObjectExpression" ||
        value.properties.length !== 1 ||
        value.properties[0].key.name !== "url" ||
        !identifier(value.properties[0].value, urlName)
    )
        return null;
    return create.arguments[0];
}

function scriptRepairs(source, sourceType) {
    let ast;
    try {
        ast = parseJavaScript(source, {
            ecmaVersion: "latest",
            sourceType,
        });
    } catch {
        // Do not guess at edits to scripts we cannot parse.
        return [];
    }
    const repairs = [];
    walk(ast, (node) => {
        if (!["Program", "BlockStatement"].includes(node.type)) return;
        for (let i = 0; i < node.body.length - 2; i += 1) {
            const cache = singleDeclaration(node.body[i]);
            const url = singleDeclaration(node.body[i + 1]);
            if (
                node.body[i].kind !== "const" ||
                cache?.init?.type !== "AwaitExpression" ||
                !sdkCall(cache.init.argument, "data", "get") ||
                unwrap(cache.init.argument).arguments.length !== 1 ||
                !url ||
                !backgroundFallback(node.body[i + 2], url.id.name)
            ) {
                continue;
            }
            const expression = url.init;
            const name = cache.id.name;
            if (
                expression?.type !== "ConditionalExpression" ||
                !identifier(member(expression.test, "found"), name) ||
                expression.alternate.type !== "Literal" ||
                expression.alternate.value !== null ||
                expression.consequent.type !== "LogicalExpression" ||
                expression.consequent.operator !== "||" ||
                !identifier(
                    member(member(expression.consequent.left, "url"), "value"),
                    name,
                ) ||
                !identifier(member(expression.consequent.right, "value"), name)
            ) {
                continue;
            }
            const key = unwrap(cache.init.argument).arguments[0];
            if (key.type !== "Literal" || typeof key.value !== "string")
                continue;
            const options = imageSequence(
                node.body[i + 2],
                url.id.name,
                key.value,
            );
            if (!options) continue;
            // Do not remove a cache binding that custom code still uses.
            let usedElsewhere = false;
            walk(
                [...node.body.slice(0, i), ...node.body.slice(i + 3)],
                (other) => {
                    if (identifier(other, name)) usedElsewhere = true;
                },
            );
            if (usedElsewhere) continue;
            repairs.push({
                start: node.body[i].start,
                end: node.body[i + 2].end,
                replacement: `${node.body[i + 1].kind} ${url.id.name} = (await ConciergeSDK.media.ensureImage({ ...${source.slice(options.start, options.end)}, key: ${JSON.stringify(key.value)} })).url;`,
            });
        }
    });
    return repairs;
}

/**
 * Repair the obsolete background-cache example embedded in saved widgets.
 * data.get(key) returns the value, not the HTTP { found, value } envelope.
 * Replace only the known cache/read/generate/save sequence with the owned
 * SDK helper. Preserve all source outside that sequence, including examples.
 * This runs on served HTML without rewriting saved or published revisions.
 */
export function repairWidgetBackgroundCache(html) {
    if (
        typeof html !== "string" ||
        !html.includes("createImage") ||
        !html.includes("found")
    ) {
        return html;
    }
    const document = parseHtml(html, { sourceCodeLocationInfo: true });
    const repairs = [];
    function visit(node) {
        if (node.tagName === "script") {
            const attributes = Object.fromEntries(
                node.attrs.map(({ name, value }) => [name, value]),
            );
            const type = (attributes.type || "").trim().toLowerCase();
            const location = node.sourceCodeLocation;
            if (
                !("src" in attributes) &&
                [
                    "",
                    "module",
                    "text/javascript",
                    "application/javascript",
                ].includes(type) &&
                location?.startTag &&
                location?.endTag
            ) {
                const start = location.startTag.endOffset;
                const source = html.slice(start, location.endTag.startOffset);
                for (const repair of scriptRepairs(
                    source,
                    type === "module" ? "module" : "script",
                )) {
                    repairs.push({
                        ...repair,
                        start: start + repair.start,
                        end: start + repair.end,
                    });
                }
            }
        }
        for (const child of node.childNodes || []) visit(child);
    }
    visit(document);
    for (const repair of repairs.sort((a, b) => b.start - a.start)) {
        html =
            html.slice(0, repair.start) +
            repair.replacement +
            html.slice(repair.end);
    }
    return html;
}
