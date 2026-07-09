// In-memory for this bootstrap slice; state resets on process restart, which
// is acceptable while the pipeline runs within a single session. Once the
// tool set grows past this slice, this module should also enforce step
// ordering — e.g. reject a call whose preconditions (prior completed steps)
// aren't met — rather than trusting the model to call tools in order.

export type StepName =
  | "read_changes"
  | "create_jira_task"
  | "create_branch"
  | "commit"
  | "open_mr"
  | "poll_ci"
  | "report";

interface SessionState {
  currentStep: StepName | null;
  completedSteps: StepName[];
}

const state: SessionState = {
  currentStep: null,
  completedSteps: [],
};

export function getState(): SessionState {
  return state;
}

export function setCurrent(step: StepName): void {
  state.currentStep = step;
}

export function markCompleted(step: StepName): void {
  if (!state.completedSteps.includes(step)) {
    state.completedSteps.push(step);
  }
}
