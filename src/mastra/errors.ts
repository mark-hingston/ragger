/**
 * Custom error class for workflow steps.
 * Allows indicating whether an error is potentially retryable.
 */
export class WorkflowError extends Error {
  readonly isRetryable: boolean;

  constructor(message: string, isRetryable = false) {
    super(message);
    this.name = "WorkflowError";
    this.isRetryable = isRetryable;

    // Ensure the prototype chain is correctly set for instanceof checks
    Object.setPrototypeOf(this, WorkflowError.prototype);
  }
}
