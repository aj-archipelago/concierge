export function getAutomationColleague(automation, colleagues = []) {
    return automation?.entityId
        ? colleagues.find((colleague) => colleague.id === automation.entityId)
        : colleagues.find((colleague) => colleague.kind === "personal");
}

export function automationBelongsToColleague(automation, colleague) {
    return Boolean(
        colleague &&
            (automation.entityId === colleague.id ||
                (!automation.entityId && colleague.kind === "personal")),
    );
}
