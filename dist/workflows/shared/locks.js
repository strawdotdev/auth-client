function targets(action, generation) {
    const result = [];
    const add = (kind, id, exclusive = true, stable = false) => result.push({ key: JSON.stringify([stable ? "runtime" : generation, kind, id]), exclusive });
    const identityTransition = [
        "signIn",
        "signUp",
        "resetPassword",
        "reauthenticate",
        "signOut",
        "switchAccount",
        "signOutAccount",
    ].includes(action.operation);
    add("identity", "current", identityTransition, true);
    if ([
        "updateProfile",
        "updateProfileImage",
        "changeEmail",
        "changePassword",
        "reauthenticate",
        "revokeSession",
        "revokeOtherSessions",
        "revokeSessions",
    ].includes(action.operation))
        add("account", "current", true, true);
    if (action.organizationId)
        add("organization", action.organizationId, action.operation === "delete" || action.operation === "leave");
    if (action.invitationId)
        add("invitation", action.invitationId);
    if (action.memberId)
        add("member", `${action.organizationId}:${action.memberId}`);
    if (action.operation.startsWith("revoke"))
        add("sessions", "all", action.operation !== "revokeSession");
    if (action.sessionId)
        add("session", action.sessionId);
    return result;
}
/** Runtime-local conflict ownership also drives the controls observing those conflicts. */
function createLocks() {
    const held = new Map();
    const listeners = new Set();
    let revision = 0;
    function changed() {
        revision++;
        for (const listener of listeners)
            listener();
    }
    function conflicts(requested, owner) {
        for (const [holder, locks] of held)
            if (holder !== owner &&
                requested.some((request) => locks.some((lock) => lock.key === request.key && (lock.exclusive || request.exclusive))))
                return true;
        return false;
    }
    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot: () => revision,
        conflicts: (action, generation) => conflicts(targets(action, generation)),
        acquire(action, generation) {
            const owner = Symbol();
            const acquired = targets(action, generation);
            if (conflicts(acquired))
                return null;
            held.set(owner, acquired);
            changed();
            return {
                extend(next) {
                    const requested = targets(next, generation);
                    if (conflicts(requested, owner))
                        return false;
                    acquired.push(...requested);
                    changed();
                    return true;
                },
                release() {
                    held.delete(owner);
                    changed();
                },
            };
        },
    };
}
const stores = new WeakMap();
export function workflowLocks(runtime) {
    let locks = stores.get(runtime);
    if (!locks) {
        locks = createLocks();
        stores.set(runtime, locks);
    }
    return locks;
}
//# sourceMappingURL=locks.js.map