import { AsyncLocalStorage } from "node:async_hooks";

// Only the capability-verified agent gateway establishes this server-side scope.
// Ordinary requests still use the normal cookie/Entra authentication path.
const agentUser = new AsyncLocalStorage();
export const getAgentToolUser = () => agentUser.getStore();
export const withAgentToolUser = (user, action) => agentUser.run(user, action);
