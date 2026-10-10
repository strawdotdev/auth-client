import type { CacheRuntime } from "../../cache/query-cache.js";
import type { WorkflowPendingAction } from "./types.js";

type Lock = { key: string; exclusive: boolean };
function targets(action: WorkflowPendingAction, generation: number): Lock[] {
  const result: Lock[] = [];
  const add = (kind: string, id: string, exclusive = true, stable = false) =>
    result.push({ key: JSON.stringify([stable ? "runtime" : generation, kind, id]), exclusive });
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
  if (
    [
      "updateProfile",
      "updateProfileImage",
      "changeEmail",
      "changePassword",
      "reauthenticate",
      "revokeSession",
      "revokeOtherSessions",
      "revokeSessions",
    ].includes(action.operation)
  )
    add("account", "current", true, true);
  if (action.organizationId)
    add(
      "organization",
      action.organizationId,
      action.operation === "delete" || action.operation === "leave",
    );
  if (action.invitationId) add("invitation", action.invitationId);
  if (action.memberId) add("member", `${action.organizationId}:${action.memberId}`);
  if (action.operation.startsWith("revoke"))
    add("sessions", "all", action.operation !== "revokeSession");
  if (action.sessionId) add("session", action.sessionId);
  return result;
}

/** Runtime-local conflict ownership also drives the controls observing those conflicts. */
function createLocks() {
  const held = new Map<symbol, Lock[]>();
  const listeners = new Set<() => void>();
  let revision = 0;
  function changed() {
    revision++;
    for (const listener of listeners) listener();
  }
  function conflicts(requested: Lock[], owner?: symbol) {
    for (const [holder, locks] of held)
      if (
        holder !== owner &&
        requested.some((request) =>
          locks.some((lock) => lock.key === request.key && (lock.exclusive || request.exclusive)),
        )
      )
        return true;
    return false;
  }
  return {
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => revision,
    conflicts: (action: WorkflowPendingAction, generation: number) =>
      conflicts(targets(action, generation)),
    acquire(action: WorkflowPendingAction, generation: number) {
      const owner = Symbol();
      const acquired = targets(action, generation);
      if (conflicts(acquired)) return null;
      held.set(owner, acquired);
      changed();
      return {
        extend(next: WorkflowPendingAction) {
          const requested = targets(next, generation);
          if (conflicts(requested, owner)) return false;
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
const stores = new WeakMap<CacheRuntime, ReturnType<typeof createLocks>>();
export function workflowLocks(runtime: CacheRuntime) {
  let locks = stores.get(runtime);
  if (!locks) {
    locks = createLocks();
    stores.set(runtime, locks);
  }
  return locks;
}
