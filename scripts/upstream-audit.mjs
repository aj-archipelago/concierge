#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), "..");

const DEFAULT_SOURCE_REF = "refs/remotes/downstream/main";
const DEFAULT_TARGET_REF = "HEAD";

const DEFAULT_CLUSTERS = [
    {
        id: "app-shell-chat-canvas",
        label: "App shell, chat, and canvas architecture",
        prefixes: [
            "app/chat/",
            "app/home/",
            "app/queries/",
            "app/workspaces/",
            "app/write/",
            "app/api/chats/",
            "app/api/workspaces/",
            "src/components/chat/",
            "src/components/canvas/",
            "src/hooks/",
            "src/layout/",
        ],
        includes: ["middleware.js", "next.config.js"],
    },
    {
        id: "file-manager-storage",
        label: "File manager, storage, and scoped file access",
        prefixes: [
            "app/api/files/",
            "app/api/storage/",
            "app/api/workspaces/[id]/files/",
            "src/components/common/UnifiedFileManager/",
            "src/components/files/",
            "src/lib/files/",
            "src/lib/storage/",
        ],
    },
    {
        id: "applets-sdk",
        label: "Applets, SDK, and shared data",
        prefixes: [
            "app/applets/",
            "app/api/applet/",
            "app/api/applets/",
            "app/api/canvas-applets/",
            "app/api/generate-applet/",
            "app/api/published/applets/",
            "app/api/published/workspaces/",
            "app/api/workspaces/[id]/applet/",
            "src/applets/",
            "src/components/applets/",
            "src/lib/applets/",
            "public/applets/",
            "public/applet-sdk.js",
        ],
    },
    {
        id: "media-generation",
        label: "Media generation UI and worker plumbing",
        prefixes: [
            "app/api/image-proxy/",
            "app/api/media/",
            "app/api/media-items/",
            "app/api/media-proxy/",
            "app/api/text-proxy/",
            "jobs/",
            "src/components/images/",
            "src/components/media/",
            "src/components/transcribe/",
            "src/components/translate/",
            "src/lib/media/",
        ],
    },
    {
        id: "automations-connectors-mcp",
        label: "Automations, connectors, and MCP",
        prefixes: [
            "app/api/automations/",
            "app/api/connectors/",
            "app/api/mcp/",
            "src/components/automations/",
            "src/components/connectors/",
            "src/lib/automations/",
            "src/lib/connectors/",
            "src/lib/mcp/",
        ],
    },
    {
        id: "docs-help-release-notes",
        label: "Help, release notes, and user-facing docs",
        prefixes: [
            "docs/",
            "src/content/help-guides/",
            "src/content/release-notes/",
            "README",
        ],
    },
    {
        id: "config-auth-deploy",
        label: "Configuration, auth, and deployment",
        prefixes: [
            ".github/workflows/",
            "app.config/",
            "app/auth/",
            "config/",
            "__mocks__/config/",
            "Dockerfile",
            "infra/",
        ],
    },
    {
        id: "tests",
        label: "Tests and fixtures",
        prefixes: ["__tests__/", "tests/", "playwright/", "test/", "e2e/"],
        includes: [".test.", ".spec.", "__tests__/"],
    },
];

const SCAN_EXCLUDED_PATHS = new Set([
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
]);
const SCAN_EXCLUDED_EXTENSIONS = new Set([
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".lock",
    ".mp3",
    ".mp4",
    ".pdf",
    ".png",
    ".svg",
    ".webp",
]);

const args = process.argv.slice(2);

const options = {
    allowDirty: false,
    failOnReview: false,
    fetch: true,
    json: false,
    out: null,
    patternFile: null,
    sourceBranch: "main",
    sourceRef: DEFAULT_SOURCE_REF,
    sourceUrl: null,
    targetRef: DEFAULT_TARGET_REF,
};

const usage = () => {
    console.log(`Usage: npm run upstream:audit -- [options]

Compares a downstream source ref with this repository and reports divergence,
file clusters, and optional forbidden-pattern findings. This command never
merges, commits, pushes, opens a browser, or creates a pull request.

Options:
  --source-url <url>       Fetch source branch from this repository URL or path
  --source-branch <name>   Source branch to fetch when --source-url is set
  --source-ref <ref>       Source git ref to compare from
  --target-ref <ref>       Target git ref to compare to
  --pattern-file <path>    JSON file containing scan patterns
  --no-fetch               Do not fetch the source ref before auditing
  --allow-dirty            Continue when this worktree has local changes
  --fail-on-review         Exit non-zero on review findings as well as blockers
  --json                   Print JSON instead of a text report
  --out <path>             Write the report to a file
  -h, --help               Show this help

Pattern file shape:
[
  { "id": "product-brand", "severity": "blocker", "pattern": "\\\\bExample\\\\b", "flags": "i" }
]
`);
};

for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--source-url") {
        options.sourceUrl = args[index + 1];
        index += 1;
    } else if (arg === "--source-branch") {
        options.sourceBranch = args[index + 1];
        index += 1;
    } else if (arg === "--source-ref") {
        options.sourceRef = args[index + 1];
        index += 1;
    } else if (arg === "--target-ref") {
        options.targetRef = args[index + 1];
        index += 1;
    } else if (arg === "--pattern-file") {
        options.patternFile = args[index + 1];
        index += 1;
    } else if (arg === "--no-fetch") {
        options.fetch = false;
    } else if (arg === "--allow-dirty") {
        options.allowDirty = true;
    } else if (arg === "--fail-on-review") {
        options.failOnReview = true;
    } else if (arg === "--json") {
        options.json = true;
    } else if (arg === "--out") {
        options.out = args[index + 1];
        index += 1;
    } else if (arg === "-h" || arg === "--help") {
        usage();
        process.exit(0);
    } else {
        console.error(`Unknown option: ${arg}`);
        usage();
        process.exit(2);
    }
}

const run = (command, commandArgs, { allowFailure = false } = {}) => {
    const result = spawnSync(command, commandArgs, {
        cwd: ROOT_DIR,
        encoding: "utf8",
        maxBuffer: 100 * 1024 * 1024,
    });

    if (result.error) throw result.error;
    if (result.status !== 0 && !allowFailure) {
        const output = [result.stdout, result.stderr]
            .filter(Boolean)
            .join("\n")
            .trim();
        throw new Error(
            `${command} ${commandArgs.join(" ")} failed with status ${result.status}${output ? `:\n${output}` : ""}`,
        );
    }

    return {
        status: result.status,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
    };
};

const git = (gitArgs, optionsForRun) =>
    run("git", gitArgs, optionsForRun).stdout.trim();

const lines = (value) =>
    value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

const quotePath = (filePath) =>
    filePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const changedPathFromStatus = (line) => {
    const parts = line.split("\t");
    const status = parts[0];
    const filePath =
        status.startsWith("R") || status.startsWith("C") ? parts[2] : parts[1];
    return { status, path: filePath };
};

const loadPatterns = () => {
    if (!options.patternFile) return [];

    const patternPath = path.resolve(ROOT_DIR, options.patternFile);
    if (!existsSync(patternPath)) {
        throw new Error(`Pattern file not found: ${options.patternFile}`);
    }

    const rawPatterns = JSON.parse(readFileSync(patternPath, "utf8"));
    if (!Array.isArray(rawPatterns)) {
        throw new Error("Pattern file must contain a JSON array.");
    }

    return rawPatterns.map((pattern) => {
        if (!pattern.id || !pattern.pattern) {
            throw new Error(
                "Each scan pattern requires id and pattern fields.",
            );
        }
        return {
            id: pattern.id,
            severity: pattern.severity || "review",
            regex: new RegExp(pattern.pattern, pattern.flags || ""),
        };
    });
};

const classifyPath = (filePath) => {
    const matches = DEFAULT_CLUSTERS.filter((cluster) => {
        const byPrefix = cluster.prefixes.some((prefix) =>
            filePath.startsWith(prefix),
        );
        const byInclude = (cluster.includes || []).some((needle) =>
            filePath.includes(needle),
        );
        return byPrefix || byInclude;
    });

    return matches.length
        ? matches.map((cluster) => cluster.id)
        : ["uncategorized"];
};

const fileContentsAtRef = (ref, filePath) => {
    if (SCAN_EXCLUDED_PATHS.has(filePath)) return null;
    if (SCAN_EXCLUDED_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
        return null;
    }

    const result = run("git", ["show", `${ref}:${filePath}`], {
        allowFailure: true,
    });

    if (result.status !== 0) return null;
    if (result.stdout.includes("\u0000")) return null;
    return result.stdout;
};

const scanFiles = (filePaths, ref, patterns) => {
    const findings = [];
    if (!patterns.length) return findings;

    for (const filePath of filePaths) {
        const contents = fileContentsAtRef(ref, filePath);
        if (!contents) continue;

        contents.split("\n").forEach((line, index) => {
            patterns.forEach((pattern) => {
                if (pattern.regex.test(line)) {
                    findings.push({
                        id: pattern.id,
                        severity: pattern.severity,
                        path: filePath,
                        line: index + 1,
                        sample: line.trim().slice(0, 220),
                    });
                }
            });
        });
    }

    return findings;
};

const buildReport = () => {
    const status = git(["status", "-sb"]);
    const dirty = lines(git(["status", "--porcelain"]));

    if (dirty.length && !options.allowDirty) {
        throw new Error(
            [
                "Worktree has local changes. Re-run with --allow-dirty for an exploratory audit.",
                status,
            ].join("\n"),
        );
    }

    if (options.fetch) {
        if (!options.sourceUrl) {
            throw new Error(
                "--source-url is required unless --no-fetch or --source-ref is already available locally.",
            );
        }
        git([
            "fetch",
            options.sourceUrl,
            `+${options.sourceBranch}:${options.sourceRef}`,
        ]);
    }

    git(["rev-parse", "--verify", options.sourceRef]);
    git(["rev-parse", "--verify", options.targetRef]);

    const patterns = loadPatterns();
    const mergeBase = git(["merge-base", options.targetRef, options.sourceRef]);
    const [targetOnly, sourceOnly] = git([
        "rev-list",
        "--left-right",
        "--count",
        `${options.targetRef}...${options.sourceRef}`,
    ])
        .split(/\s+/)
        .map(Number);
    const shortstat = git([
        "diff",
        "--shortstat",
        `${options.targetRef}...${options.sourceRef}`,
    ]);
    const dirstat = lines(
        git([
            "diff",
            "--dirstat=files,0",
            `${options.targetRef}...${options.sourceRef}`,
        ]),
    );
    const nameStatus = lines(
        git([
            "diff",
            "--name-status",
            `${options.targetRef}...${options.sourceRef}`,
        ]),
    ).map(changedPathFromStatus);

    const clusters = new Map([
        ...DEFAULT_CLUSTERS.map((cluster) => [
            cluster.id,
            {
                id: cluster.id,
                label: cluster.label,
                files: [],
                count: 0,
            },
        ]),
        [
            "uncategorized",
            {
                id: "uncategorized",
                label: "Uncategorized",
                files: [],
                count: 0,
            },
        ],
    ]);

    nameStatus.forEach((entry) => {
        classifyPath(entry.path).forEach((clusterId) => {
            const cluster = clusters.get(clusterId);
            cluster.count += 1;
            if (cluster.files.length < 25) {
                cluster.files.push(`${entry.status}\t${entry.path}`);
            }
        });
    });

    const changedFiles = nameStatus
        .filter((entry) => !entry.status.startsWith("D"))
        .map((entry) => entry.path);
    const findings = scanFiles(changedFiles, options.sourceRef, patterns);
    const findingCounts = findings.reduce((counts, finding) => {
        counts[finding.severity] = (counts[finding.severity] || 0) + 1;
        return counts;
    }, {});

    return {
        generatedAt: new Date().toISOString(),
        root: ROOT_DIR,
        status,
        dirtyFiles: dirty,
        refs: {
            sourceBranch: options.sourceBranch,
            sourceRef: options.sourceRef,
            sourceHead: git(["rev-parse", options.sourceRef]),
            targetRef: options.targetRef,
            targetHead: git(["rev-parse", options.targetRef]),
            mergeBase,
        },
        divergence: {
            targetOnly,
            sourceOnly,
            shortstat,
            dirstat,
        },
        clusters: [...clusters.values()].filter((cluster) => cluster.count > 0),
        scan: {
            patternCount: patterns.length,
            counts: findingCounts,
            findings,
        },
        recommendation: [
            "Use this report to choose one feature cluster for a focused branch.",
            "Sanitize product names, sample content, deployment configuration, and credentials in the same branch as the port.",
            "Resolve blocker findings before opening a public pull request.",
            "Validate the final branch with this repository's own tests and build.",
        ],
    };
};

const renderText = (report) => {
    const clusterLines = report.clusters.flatMap((cluster) => [
        `- ${cluster.label}: ${cluster.count} files`,
        ...cluster.files.map((file) => `  ${file}`),
    ]);

    const findingLines = report.scan.findings.slice(0, 80).map((finding) => {
        const location = `${finding.path}:${finding.line}`;
        return `- [${finding.severity}] ${finding.id} ${location} :: ${finding.sample}`;
    });

    return `# Upstream Audit

Generated: ${report.generatedAt}
Worktree: ${report.status}

## Refs

- Target: ${report.refs.targetRef} (${report.refs.targetHead})
- Source: ${report.refs.sourceRef} (${report.refs.sourceHead})
- Merge base: ${report.refs.mergeBase}

## Divergence

- Target-only commits: ${report.divergence.targetOnly}
- Source-only commits: ${report.divergence.sourceOnly}
- Diff: ${report.divergence.shortstat || "no file diff"}

Directory spread:
${report.divergence.dirstat.length ? report.divergence.dirstat.map((line) => `- ${line}`).join("\n") : "- none"}

## File Clusters

${clusterLines.length ? clusterLines.join("\n") : "- No changed files"}

## Forbidden Pattern Scan

- Patterns loaded: ${report.scan.patternCount}
- Blocker findings: ${report.scan.counts.blocker || 0}
- Review findings: ${report.scan.counts.review || 0}

${findingLines.length ? findingLines.join("\n") : "No findings."}
${report.scan.findings.length > findingLines.length ? `\n\n... ${report.scan.findings.length - findingLines.length} additional findings omitted from text output. Use --json for the full set.` : ""}

## Recommendation

${report.recommendation.map((line) => `- ${line}`).join("\n")}
`;
};

try {
    const report = buildReport();
    const output = options.json
        ? `${JSON.stringify(report, null, 2)}\n`
        : renderText(report);

    if (options.out) {
        const outPath = path.resolve(ROOT_DIR, options.out);
        mkdirSync(path.dirname(outPath), { recursive: true });
        writeFileSync(outPath, output);
        console.log(`Wrote ${quotePath(path.relative(ROOT_DIR, outPath))}`);
    } else {
        process.stdout.write(output);
    }

    if (
        (report.scan.counts.blocker || 0) > 0 ||
        (options.failOnReview && (report.scan.counts.review || 0) > 0)
    ) {
        process.exitCode = 1;
    }
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
