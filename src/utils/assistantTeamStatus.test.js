import {
    assignmentState,
    isTeamActive,
    memberActivity,
    teamCounts,
    teamState,
    teamCurrentWork,
} from "./assistantTeamStatus";
const root = {
    taskStatus: "waiting",
    state: "active",
    coordinatorId: "assistant",
    members: [{ assistantId: "assistant" }, { assistantId: "pixel" }],
    assignments: [],
};
const work = {
    messageId: "m",
    to: "pixel",
    from: "assistant",
    purpose: "assignment",
    status: "pending",
    executionStatus: "pending",
};
it("distinguishes recruitment from queued and running assignments", () => {
    expect(memberActivity(root, root.members[1]).state).toBe("recruited");
    expect(assignmentState(work, root)).toBe("queued");
    expect(
        assignmentState({ ...work, executionStatus: "in_progress" }, root),
    ).toBe("working");
    expect(
        assignmentState(
            { ...work, purpose: "review", executionStatus: "in_progress" },
            root,
        ),
    ).toBe("reviewing");
});
it("keeps blocked/revision outcomes distinct from successful execution", () => {
    for (const outcome of ["blocked", "needs_revision", "accepted"])
        expect(
            assignmentState(
                {
                    ...work,
                    status: "answered",
                    executionStatus: "completed",
                    result: { outcome },
                },
                root,
            ),
        ).toBe(outcome);
    expect(
        teamCounts({
            ...root,
            assignments: [
                { ...work, status: "answered", result: { outcome: "blocked" } },
                {
                    ...work,
                    status: "answered",
                    result: { outcome: "accepted" },
                },
            ],
        }),
    ).toEqual({ completed: 2, total: 2 });
});
it("gives questions attention while allowing other work to continue", () => {
    const question = {
        ...work,
        to: "user",
        from: "pixel",
        purpose: "question",
        questionChatId: "question",
    };
    const team = {
        ...root,
        assignments: [{ ...work, executionStatus: "in_progress" }, question],
    };
    expect(teamState(team)).toBe("needs_answer");
    expect(memberActivity(team, root.members[1]).state).toBe("working");
    expect(memberActivity(team, root.members[1]).question).toBe(question);
    expect(assignmentState({ ...question, status: "answered" }, root)).toBe(
        "answered",
    );
});
it("does not present incomplete or stopped teams as complete", () => {
    expect(teamState({ ...root, taskStatus: "completed" })).toBe("interrupted");
    expect(
        teamState({ ...root, taskStatus: "completed", state: "completed" }),
    ).toBe("completed");
    expect(
        teamState({
            ...root,
            taskStatus: "failed",
            assignments: [{ ...work, to: "user" }],
        }),
    ).toBe("failed");
    expect(assignmentState(work, { ...root, taskStatus: "cancelled" })).toBe(
        "interrupted",
    );
    expect(isTeamActive({ ...root, taskStatus: "completed" })).toBe(false);
});
it("shows live parallel work even when another assignment finished later", () => {
    const team = {
        ...root,
        assignments: [
            { ...work, executionStatus: "in_progress" },
            {
                ...work,
                messageId: "second",
                status: "answered",
                executionStatus: "completed",
            },
        ],
    };
    expect(memberActivity(team, root.members[1]).assignment.messageId).toBe(
        "m",
    );
    expect(teamState(team)).toBe("working");
});
it("does not animate saved in-progress flags without recent worker activity", () => {
    const team = { ...root, taskStatus: "in_progress", activityStale: true };
    expect(memberActivity(team, root.members[0]).state).toBe("unconfirmed");
    expect(teamState(team)).toBe("unconfirmed");
    expect(
        assignmentState(
            { ...work, executionStatus: "in_progress", activityStale: true },
            root,
        ),
    ).toBe("unconfirmed");
});

it("shows the recorded stage, with unanswered questions taking precedence", () => {
    const team = { ...root, currentStep: "Testing the playable build" };
    expect(teamCurrentWork(team, (key) => key)).toBe(
        "Testing the playable build",
    );
    expect(
        teamCurrentWork(
            {
                ...team,
                assignments: [
                    {
                        ...work,
                        to: "user",
                        request: "Approve the final artwork?",
                    },
                ],
            },
            (key) => key,
        ),
    ).toBe("Approve the final artwork?");
});
