"use client";
import { useTranslation } from "react-i18next";
import { ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import ColleagueAvatar, { getEntityWispVariant } from "./ColleagueAvatar";

export const ASSISTANT_COLUMNS = [
    { key: "name", label: "Name", className: "sm:w-56" },
    {
        key: "description",
        label: "assistantDirectory.description",
        className: "hidden lg:table-cell",
    },
    { key: "model", label: "Model", className: "hidden md:table-cell w-40" },
    { key: "status", label: "assistantDirectory.status", className: "w-24" },
    {
        key: "access",
        label: "assistantDirectory.role",
        className: "hidden sm:table-cell w-28",
    },
    {
        key: "unread",
        label: "assistantDirectory.updates",
        className: "w-16 sm:w-20",
    },
];

export default function AssistantList({
    rows,
    sort,
    descending,
    onSort,
    onSelect,
    serverSorted = false,
    sortableKeys = ASSISTANT_COLUMNS.map((column) => column.key),
}) {
    const { t, i18n } = useTranslation();
    const collator = new Intl.Collator(i18n?.language, {
        numeric: true,
        sensitivity: "base",
    });
    const sorted = serverSorted
        ? rows
        : [...rows].sort((a, b) => {
              const order =
                  sort === "unread"
                      ? a.unread - b.unread
                      : collator.compare(a[sort], b[sort]);
              return (
                  (descending ? -order : order) ||
                  collator.compare(a.name, b.name)
              );
          });
    return (
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <Table className="table-fixed" aria-label={t("colleagues.team")}>
                <TableHeader className="bg-gray-50 dark:bg-gray-800/60">
                    <TableRow className="border-gray-200 dark:border-gray-700">
                        {ASSISTANT_COLUMNS.map((column) => {
                            const active = sort === column.key;
                            const Icon = active
                                ? descending
                                    ? ChevronDown
                                    : ChevronUp
                                : ArrowUpDown;
                            return (
                                <TableHead
                                    key={column.key}
                                    scope="col"
                                    className={`h-10 px-2 text-start sm:px-3 ${column.className}`}
                                    aria-sort={
                                        active
                                            ? descending
                                                ? "descending"
                                                : "ascending"
                                            : "none"
                                    }
                                >
                                    <button
                                        type="button"
                                        className="flex min-h-10 w-full items-center gap-1 text-start text-xs text-gray-600 hover:text-gray-900 focus-visible:outline-sky-500 dark:text-gray-400 dark:hover:text-gray-100"
                                        disabled={
                                            !sortableKeys.includes(column.key)
                                        }
                                        onClick={() => onSort(column.key)}
                                    >
                                        <span className="truncate">
                                            {t(column.label)}
                                        </span>
                                        {sortableKeys.includes(column.key) && (
                                            <Icon
                                                aria-hidden="true"
                                                className={`h-3.5 w-3.5 shrink-0 ${active ? "text-sky-600 dark:text-sky-400" : ""}`}
                                            />
                                        )}
                                    </button>
                                </TableHead>
                            );
                        })}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sorted.map((row) => (
                        <TableRow
                            key={row.assistant.id}
                            className="group cursor-pointer border-gray-100 focus-within:bg-sky-50 hover:bg-gray-50 dark:border-gray-800 dark:focus-within:bg-sky-950 dark:hover:bg-gray-800/50"
                            onClick={() => onSelect(row.assistant)}
                        >
                            <TableCell className="px-2 py-0 sm:px-3">
                                <button
                                    type="button"
                                    className="flex h-10 w-full min-w-0 items-center gap-2 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onSelect(row.assistant);
                                    }}
                                    title={row.name}
                                >
                                    <ColleagueAvatar
                                        entityId={row.assistant.id}
                                        variant={getEntityWispVariant(
                                            row.assistant,
                                        )}
                                        className="h-6 w-6 shrink-0"
                                        animated={false}
                                    />
                                    <span className="truncate font-medium text-gray-900 dark:text-gray-100">
                                        {row.name}
                                    </span>
                                </button>
                            </TableCell>
                            <TableCell
                                title={row.description}
                                className="hidden truncate px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 lg:table-cell"
                            >
                                {row.description || "—"}
                            </TableCell>
                            <TableCell
                                title={row.model}
                                className="hidden truncate px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 md:table-cell"
                            >
                                {row.model}
                            </TableCell>
                            <TableCell
                                className="truncate px-2 py-1.5 text-xs text-gray-600 dark:text-gray-300 sm:px-3"
                                title={row.status}
                            >
                                {row.status}
                            </TableCell>
                            <TableCell
                                className="hidden truncate px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 sm:table-cell"
                                title={row.access}
                            >
                                {row.access}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-end text-xs tabular-nums sm:px-3">
                                {row.unread > 0 ? (
                                    <span
                                        className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                                        aria-label={t(
                                            "colleagues.newResultsCount",
                                            { count: row.unread },
                                        )}
                                    >
                                        {row.unread}
                                    </span>
                                ) : (
                                    <span className="text-gray-400 dark:text-gray-500">
                                        —
                                    </span>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
