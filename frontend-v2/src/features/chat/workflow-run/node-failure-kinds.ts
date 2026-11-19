/** Wire values for `NodeFailureKind`; kept in one list so i18n tests can iterate them. */
export const NODE_FAILURE_KINDS = [
  "missing_agent_ref",
  "workflow_model_not_found",
  "workflow_role_not_found",
  "missing_agent_config",
  "invalid_run_payload",
  "prompt_template",
  "structured_output",
  "missing_skill_materialization",
  "session_ended_without_stop_reason",
  "session_binding_rejected",
  "baseline_persist",
  "repository",
  "session",
  "agent_refusal",
  "unknown_stop_reason",
  "interrupted_by_restart",
  "multiple_outputs",
  "condition_evaluation",
  // v2 only: an interactive Agent node whose session could not be set up, never auto-retried.
  "interactive_session",
  // v2 only: the run's starter left the workspace (removed, or the account disabled), so the Agent
  // was refused under their identity; never auto-retried.
  "starter_unavailable",
] as const;

/**
 * Kinds a same-version rerun describes to the agent when the run injects previous failures;
 * mirrors `NodeFailureKind::inject_into_prompt`. A row of one of these kinds recorded with
 * `injects_previous_failure: false` belongs to a run created with that injection off.
 */
export const PROMPT_INJECTED_FAILURE_KINDS: ReadonlySet<string> = new Set([
  "structured_output",
  "agent_refusal",
  "unknown_stop_reason",
  "multiple_outputs",
]);

/**
 * Kinds whose `workflowRun.errorHint` text promises the retry will carry the failure; they also
 * have a `workflowRun.errorHintWithoutInjection` text for runs that inject nothing.
 */
export const HINT_PROMISES_INJECTION_KINDS: ReadonlySet<string> = new Set([
  "structured_output",
  "agent_refusal",
]);

/**
 * An interactive Agent node's session failed before any conversation, so the node row carries the
 * single `interactive_session` kind and v2-server's failure `message` tells which situation it
 * was. The frontend shows a scenario-specific reason and next step instead of the generic
 * "check the agent process and network" text.
 *
 * Matching runs on v2-server's stable, test-covered messages (workflowhost/interactive.go): a
 * reattached checkout Node no longer knows (a restart dropped its ledger/clone record) on the
 * first turn, a checkout that no longer exists on a later turn, and a session setup the Agent
 * refused. v2-server is temporary; when Cloud serves the contract the codes will align.
 */
export type InteractiveSessionScenario =
  | "checkout_unknown"
  | "workspace_gone"
  | "setup_refused"
  | "other";

export function interactiveSessionScenario(message: string): InteractiveSessionScenario {
  const m = message.toLowerCase();
  if (m.includes("fresh clone") || m.includes("no longer knows the run's checkout")) {
    return "checkout_unknown";
  }
  if (m.includes("no longer exists")) {
    return "workspace_gone";
  }
  if (m.includes("could not be set up") || m.includes("refused the agent session")) {
    return "setup_refused";
  }
  return "other";
}
