import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { workflowLocks } from "./locks.js";
import { useMutation } from "@tanstack/react-query";
import { useClientBoundary } from "../../client/provider-context.js";
import type { CacheRuntime } from "../../cache/query-cache.js";
import type {
  WorkflowError,
  WorkflowOutcome,
  WorkflowPendingAction,
  PolicyDecision,
  WorkflowDisabledReason,
  WorkflowFeedback,
  WorkflowFeedbackOptions,
} from "./types.js";

export type Values = Record<string, unknown>;
export const asRecord = (value: unknown): Values | undefined =>
  value !== null && typeof value === "object" ? (value as Values) : undefined;
export const asRecords = (value: unknown): Values[] =>
  Array.isArray(value) ? value.map(asRecord).filter((row): row is Values => !!row) : [];
/** Better Auth's error code (`INVALID_EMAIL_OR_PASSWORD`, ...) from a thrown or returned error. */
export function getAuthErrorCode(cause: unknown): string | undefined {
  const row = asRecord(cause);
  if (!row) return;
  if (typeof row.code === "string") return row.code;
  return getAuthErrorCode(row.error) ?? getAuthErrorCode(row.body);
}
export const ignored = (
  reason: "disabled" | "busy" | "obsolete" | "unavailable",
): WorkflowOutcome<never> => ({ status: "ignored", reason });
const conflict = Symbol("workflow conflict");
const unavailable = Symbol("workflow unavailable");
const handledFailure = Symbol("handled workflow failure");

type HandledFailure = {
  [handledFailure]: true;
  cause: unknown;
};

/** Marks a failure already represented by workflow-owned state, such as form validation. */
export const handledWorkflowFailure = (cause: unknown): HandledFailure => ({
  [handledFailure]: true,
  cause,
});

export function classifyWorkflowFailure(cause: unknown) {
  const handled =
    typeof cause === "object" && cause !== null && handledFailure in cause
      ? (cause as HandledFailure)
      : null;
  return { cause: handled?.cause ?? cause, isHandled: handled !== null };
}

export function requireAvailable(condition: unknown): asserts condition {
  if (!condition) throw unavailable;
}
export function enforcePolicy(decision: PolicyDecision) {
  if (!decision.allowed) throw { code: decision.code };
}
export const allowed: PolicyDecision = { allowed: true };
export const denied = (code: string): PolicyDecision => ({ allowed: false, code });
export const policyReason = (decision: PolicyDecision): WorkflowDisabledReason | null =>
  decision.allowed ? null : { code: "policy", policyCode: decision.code };
export function useCommittedRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
export function getActionState(action: WorkflowActionController) {
  return {
    feedback: action.feedback(),
    isPending: action.isBusy,
    diagnostics: { pendingAction: action.pendingAction, error: action.error },
    reset: () => action.reset(),
  };
}
export type ActionExecution = {
  write(
    fn: () => Promise<unknown>,
    target?: string | Partial<WorkflowPendingAction>,
  ): Promise<unknown>;
  current(): boolean;
  complete(callback: () => void | Promise<void>): Promise<void>;
  phase(phase: WorkflowError["phase"]): void;
  signal: AbortSignal;
};

export type WorkflowActionController = {
  control(
    target: WorkflowPendingAction,
    reason?: WorkflowDisabledReason | null,
  ): { isDisabled: boolean; isPending: boolean; disabledReason: WorkflowDisabledReason | null };
  feedback(recoveries?: WorkflowFeedback[]): WorkflowFeedback[];
  readonly owner: symbol;
  readonly actorId?: string;
  readonly available: boolean;
  readonly isBusy: boolean;
  readonly pendingAction: WorkflowPendingAction | null;
  readonly error: WorkflowError | null;
  current(): boolean;
  busy(): boolean;
  canEdit(): boolean;
  run<T>(
    pending: WorkflowPendingAction,
    work: (transaction: ActionExecution) => Promise<T>,
    alreadyWritten?: boolean,
  ): Promise<WorkflowOutcome<T>>;
  reset(): void;
};

type OperationState = {
  owner: symbol;
  pending: WorkflowPendingAction | null;
  error: WorkflowError | null;
  target?: WorkflowPendingAction;
};

// Recovery already presents its operation's error; don't render it a second time.
export function operationFeedback(
  state: OperationState | undefined,
  recoveries: WorkflowFeedback[],
): WorkflowFeedback[] {
  if (!state?.error || !state.target) return recoveries;
  const { target, error } = state;
  const represented = recoveries.some(
    (entry) =>
      entry.target.operation === target.operation &&
      entry.target.invitationId === target.invitationId &&
      (target.invitationId !== undefined || entry.target.organizationId === target.organizationId),
  );
  return represented
    ? recoveries
    : [...recoveries, { target, error: error.cause, diagnostics: error, recovery: null }];
}

export function actionControl(
  available: boolean,
  pending: WorkflowPendingAction | null | undefined,
  target: WorkflowPendingAction,
  conflicts: boolean,
  reason: WorkflowDisabledReason | null,
  unavailableReason: WorkflowDisabledReason = { code: "disabled" },
) {
  const disabledReason = !available
    ? unavailableReason
    : pending != null || conflicts
      ? { code: "busy" as const }
      : reason;
  return {
    isDisabled: disabledReason !== null,
    isPending:
      pending != null &&
      Object.entries(target).every(
        ([key, value]) => pending[key as keyof WorkflowPendingAction] === value,
      ),
    disabledReason,
  };
}

/** TanStack observes writes; this coordinator owns only locks and guarded continuations. */
export function useWorkflowAction(
  runtime: CacheRuntime,
  scope: string,
  enabled = true,
  options: WorkflowFeedbackOptions = {},
) {
  const callbacks = useCommittedRef(options);
  const locks = workflowLocks(runtime);
  useSyncExternalStore(locks.subscribe, locks.getSnapshot, locks.getSnapshot);
  const { identity, disposed } = useClientBoundary(runtime);
  const key = JSON.stringify([identity, scope, disposed]);
  const [boundary, setBoundary] = useState(() => ({ key, owner: Symbol() }));
  if (boundary.key !== key) setBoundary({ key, owner: Symbol() });
  const { owner } = boundary;
  const lifecycle = useRef({
    owner,
    active: false,
    busy: false,
    available: false,
    suspension: 0,
    controllers: new Set<AbortController>(),
  });
  // Organization, invitation, session and account workflows need an account, not a guest.
  const available = enabled && identity.ready && !identity.isAnonymous && !disposed;
  const unavailableReason: WorkflowDisabledReason =
    enabled && identity.ready && identity.isAnonymous && !disposed
      ? { code: "accountRequired" }
      : { code: "disabled" };
  const { reset: resetMutation, mutateAsync } = useMutation(
    {
      mutationFn: (write: () => Promise<unknown>) => write(),
      retry: false,
      gcTime: 0,
      networkMode: "always",
    },
    runtime.cache,
  );
  const [feedback, setFeedback] = useState<OperationState>();
  useLayoutEffect(() => {
    const lease = {
      owner,
      active: true,
      busy: false,
      available: false,
      suspension: 0,
      controllers: new Set<AbortController>(),
    };
    lifecycle.current = lease;
    resetMutation();
    return () => {
      lease.active = false;
      for (const controller of lease.controllers) controller.abort();
      resetMutation();
    };
  }, [owner, resetMutation]);
  useLayoutEffect(() => {
    lifecycle.current.available = available;
    if (!available) {
      lifecycle.current.suspension++;
      for (const controller of lifecycle.current.controllers) controller.abort();
    }
  }, [owner, available]);
  const current = () =>
    lifecycle.current.active && lifecycle.current.owner === owner && !runtime.disposed;
  const busy = () => lifecycle.current.owner === owner && lifecycle.current.busy;
  function reset() {
    if (current() && !busy()) {
      resetMutation();
      setFeedback(undefined);
    }
  }
  async function run<T>(
    pending: WorkflowPendingAction,
    work: (transaction: ActionExecution) => Promise<T>,
    alreadyWritten = false,
  ): Promise<WorkflowOutcome<T>> {
    if (!current()) return ignored("obsolete");
    if (!lifecycle.current.available) return ignored("disabled");
    if (busy()) return ignored("busy");
    const generation = runtime.generation;
    const lock = locks.acquire(pending, generation);
    if (!lock) return ignored("busy");
    const lease = lifecycle.current;
    lease.busy = true;
    const controller = new AbortController();
    lease.controllers.add(controller);
    const suspension = lease.suspension;
    setFeedback({ owner, pending, error: null });
    let phase: WorkflowError["phase"] = "write";
    let writeSucceeded = alreadyWritten;
    let completionDelivered = false;
    const valid = () =>
      current() &&
      lifecycle.current === lease &&
      lease.available &&
      lease.suspension === suspension &&
      generation === runtime.generation;
    try {
      const data = await work({
        current: valid,
        signal: controller.signal,
        phase: (next) => {
          phase = next;
        },
        complete: async (callback) => {
          if (!valid()) throw new Error("Obsolete workflow completion");
          phase = "callback";
          completionDelivered = true;
          await callback();
        },
        write: async (fn, target) => {
          if (!valid()) throw new Error("Obsolete workflow");
          if (target) {
            pending = {
              ...pending,
              ...(typeof target === "string" ? { invitationId: target } : target),
            };
            if (!lock.extend(pending)) throw conflict;
            setFeedback({ owner, pending, error: null });
          }
          const result = await mutateAsync(() => {
            if (!valid()) throw new Error("Obsolete workflow");
            return fn();
          });
          writeSucceeded = true;
          return result;
        },
      });
      if (!valid() && !completionDelivered) return ignored("obsolete");
      return { status: "success", data };
    } catch (cause) {
      if (!valid() && !completionDelivered) return ignored("obsolete");
      if (cause === conflict) return ignored("busy");
      if (cause === unavailable) return ignored("unavailable");
      const failure = classifyWorkflowFailure(cause);
      const error = { phase, cause: failure.cause, writeSucceeded };
      if (valid() && !failure.isHandled) {
        setFeedback({ owner, pending: null, error, target: pending });
        callbacks.current.onError?.({
          target: pending,
          error: failure.cause,
          diagnostics: error,
        });
      }
      return { status: "error", error };
    } finally {
      lock.release();
      lease.controllers.delete(controller);
      if (current() && lifecycle.current === lease) {
        lease.busy = false;
        resetMutation();
        setFeedback((previous) =>
          previous?.owner === owner ? { ...previous, pending: null } : previous,
        );
      }
    }
  }
  const visible = available && feedback?.owner === owner ? feedback : undefined;
  function control(target: WorkflowPendingAction, reason: WorkflowDisabledReason | null = null) {
    return actionControl(
      available,
      visible?.pending,
      target,
      locks.conflicts(target, runtime.generation),
      reason,
      unavailableReason,
    );
  }
  return {
    control,
    feedback: (recoveries: WorkflowFeedback[] = []) => operationFeedback(visible, recoveries),
    owner,
    actorId: identity.userId,
    available,
    current,
    busy,
    canEdit: () => current() && lifecycle.current.available && !busy(),
    run,
    reset,
    isBusy: visible?.pending != null,
    pendingAction: visible?.pending ?? null,
    error: visible?.error ?? null,
  };
}
