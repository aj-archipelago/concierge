export const DEFAULT_PAGE_SIZE = 30;
export const DEFAULT_CHAT_MESSAGES_LIMIT = 30;
// Cosmos' observed document ceiling is 2 MB. Keep an individual stored
// message comfortably below it so wrapper metadata cannot push the write over.
export const CHAT_MESSAGE_TARGET_BYTES = 1_200_000;
