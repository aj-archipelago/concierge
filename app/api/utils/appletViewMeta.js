export function buildAppletViewMeta(ownerId, currentUser) {
    if (!currentUser?._id || ownerId == null) {
        return null;
    }

    const isOwner = String(ownerId) === String(currentUser._id);
    return {
        isOwner,
        canAdminCopy: currentUser.role === "admin" && !isOwner,
    };
}
