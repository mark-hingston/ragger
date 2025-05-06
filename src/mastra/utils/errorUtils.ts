import { WorkflowError } from "../errors";

/**
 * Determines if an error is potentially retryable.
 * Checks for specific HTTP status codes and common network error messages.
 * @param error The error object.
 * @returns True if the error is retryable, false otherwise.
 */
export function isRetryableError(error: any): boolean {
  if (!error) {
    return false;
  }

  if (error instanceof WorkflowError) {
    return error.isRetryable;
  }

  if (typeof error.status === 'number') {
    if (error.status === 429 || error.status >= 500) {
      return true;
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes("econnrefused") ||
      message.includes("timeout") ||
      message.includes("network error") ||
      message.includes("fetch failed")
    ) {
      return true;
    }
  }

  return false;
}