import type { ReactNode } from "react";
import type { Data, Result, SessionClient, SessionsClient } from "../../client/types.js";
import type { WorkflowActionState, WorkflowAction, WorkflowFeedbackOptions } from "../shared/types.js";
type Callback<T> = (value: T) => void | Promise<void>;
type Component<P, _State> = (props: P & {
    children?: ReactNode;
}) => ReactNode;
type Read<T> = Omit<Result<T>, "error" | "isPending"> & {
    isLoading: boolean;
    queryError: unknown;
};
export type SessionsOptions<C extends SessionsClient> = WorkflowFeedbackOptions & {
    enabled?: boolean;
    onRevoked?: Callback<{
        operation: "revokeSession" | "revokeOtherSessions" | "revokeSessions";
        sessionId?: string;
        result: Data<C["revokeSession"]> | Data<C["revokeSessions"]> | Data<C["revokeOtherSessions"]>;
    }>;
};
export type SessionsState<C extends SessionsClient & SessionClient> = Read<Data<C["listSessions"]>> & WorkflowActionState & {
    session(sessionId: string): {
        revoke: WorkflowAction<[], Data<C["revokeSession"]>>;
    };
    actions: {
        revokeOthers: WorkflowAction<[], Data<C["revokeOtherSessions"]>>;
        revokeAll: WorkflowAction<[], Data<C["revokeSessions"]>>;
    };
    currentSession: NonNullable<ReturnType<C["useSession"]>["data"]>["session"] | undefined;
    currentSessionId: string | undefined;
    needsFreshSession: boolean;
};
export type SessionWorkflows<C extends SessionsClient & SessionClient> = {
    useSessionsContext(): SessionsState<C>;
    useSessions(this: void, options?: SessionsOptions<C>): SessionsState<C>;
    Sessions: Component<SessionsOptions<C>, SessionsState<C>>;
};
export {};
//# sourceMappingURL=types.d.ts.map