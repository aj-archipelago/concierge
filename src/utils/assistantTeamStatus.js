export const isTeamActive = (team) =>
    ["pending", "in_progress", "waiting"].includes(team?.taskStatus);
const stopped = ["failed", "cancelled", "abandoned"];
export function assignmentState(assignment, team) {
    if (
        assignment.status === "failed" ||
        stopped.includes(assignment.executionStatus)
    )
        return assignment.executionStatus || "failed";
    if (assignment.result?.outcome) return assignment.result.outcome;
    if (assignment.status === "answered")
        return assignment.purpose === "question" ? "answered" : "completed";
    if (assignment.executionStatus === "completed") return "completed";
    if (assignment.to === "user")
        return isTeamActive(team) ? "needs_answer" : "interrupted";
    if (
        assignment.executionStatus === "in_progress" &&
        assignment.activityStale
    )
        return "unconfirmed";
    if (assignment.executionStatus === "in_progress")
        return assignment.purpose === "review" ? "reviewing" : "working";
    if (!isTeamActive(team)) return "interrupted";
    if (assignment.executionStatus === "waiting") return "waiting";
    return "queued";
}
export function teamState(team) {
    if (stopped.includes(team.taskStatus)) return team.taskStatus;
    if (team.taskStatus === "completed")
        return team.state === "completed" ? "completed" : "interrupted";
    if (
        (team.assignments || []).some(
            (a) => a.to === "user" && a.status === "pending",
        )
    )
        return "needs_answer";
    if (
        (team.assignments || []).some((a) =>
            ["working", "reviewing"].includes(assignmentState(a, team)),
        )
    )
        return "working";
    if (
        (team.assignments || []).some(
            (a) => assignmentState(a, team) === "unconfirmed",
        )
    )
        return "unconfirmed";
    if (team.taskStatus === "in_progress" && team.activityStale)
        return "unconfirmed";
    return team.taskStatus === "in_progress"
        ? "working"
        : team.taskStatus === "waiting"
          ? "waiting"
          : "queued";
}
export function memberActivity(team, member) {
    const assignments = (team.assignments || []).filter(
        (a) => a.to === member.assistantId && a.to !== "user",
    );
    const current = assignments.filter(
        (a) =>
            a.status === "pending" &&
            !["completed", ...stopped].includes(a.executionStatus),
    );
    const question = (team.assignments || []).find(
        (a) =>
            a.from === member.assistantId &&
            a.to === "user" &&
            a.status === "pending",
    );
    const working = current.find((a) => a.executionStatus === "in_progress");
    const assignment = working || current.at(-1) || assignments.at(-1);
    if (working)
        return { state: assignmentState(working, team), assignment, question };
    if (question && isTeamActive(team))
        return { state: "needs_answer", assignment, question };
    if (assignment)
        return { state: assignmentState(assignment, team), assignment };
    if (member.assistantId === team.coordinatorId) {
        return {
            state: isTeamActive(team)
                ? team.taskStatus === "in_progress"
                    ? team.activityStale
                        ? "unconfirmed"
                        : "coordinating"
                    : team.taskStatus === "waiting"
                      ? "waiting"
                      : "queued"
                : teamState(team),
        };
    }
    return { state: "recruited" };
}
export function teamCounts(team) {
    const assignments = (team.assignments || []).filter(
        (a) => a.to !== "user" && a.purpose !== "question",
    );
    return {
        total: assignments.length,
        completed: assignments.filter((a) => a.status === "answered").length,
    };
}
export function teamCurrentWork(team, t) {
    if (!isTeamActive(team)) return t(`teams.state.${teamState(team)}`);
    if (teamState(team) === "unconfirmed") return t("teams.staleHint");
    const names = team.members
        .filter((m) =>
            ["working", "reviewing", "coordinating"].includes(
                memberActivity(team, m).state,
            ),
        )
        .map((m) => m.name)
        .join(t("teams.nameSeparator"));
    if (teamState(team) === "needs_answer") {
        const question = team.assignments.find(
            (a) => a.to === "user" && a.status === "pending",
        );
        return question?.request?.slice(0, 240) || t("teams.needsAnswerHint");
    }
    if (team.currentStep) return team.currentStep;
    const current = (team.assignments || []).filter((a) =>
        ["working", "reviewing"].includes(assignmentState(a, team)),
    );
    const work = current.map((a) => a.statusText || a.request).filter(Boolean);
    if (work.length)
        return work
            .slice(0, 2)
            .map((v) => v.slice(0, 180))
            .join(" · ");
    if (names) return t("teams.workingNow", { names });
    const waiting = team.members
        .filter(
            (m) =>
                ["queued", "waiting"].includes(memberActivity(team, m).state) &&
                m.assistantId !== team.coordinatorId,
        )
        .map((m) => m.name)
        .join(t("teams.nameSeparator"));
    return waiting
        ? t("teams.waitingOn", { names: waiting })
        : t("teams.coordinatorNext");
}
