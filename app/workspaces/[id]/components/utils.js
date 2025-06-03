export function getMessagesUpToVersion(messages, versionIndex) {
    if (!messages) return [];
    const idx = messages.findLastIndex(
        (msg) => msg.linkToVersion === versionIndex,
    );
    if (idx === -1) return messages;
    return messages.slice(0, idx + 1);
}
