import { createWorkflow } from "@mastra/core/workflows/vNext";
import { z } from "zod";

import { enhanceQueryStep } from "./steps/enhanceQueryStep";
import { getContextStep } from "./steps/getContextStep";
import { decideRetrievalStep } from "./steps/decideRetrievalStep";
import { generateResponseStep } from "./steps/generateResponseStep";
import { evaluateAndRetryStep } from "./steps/evaluateAndRetryStep";

// --- Workflow Definition ---
export const ragWorkflow = createWorkflow({
  id: "ragWorkflow",
  inputSchema: z.object({
    userQuery: z.string(),
  }),
  outputSchema: z.object({
    finalAnswer: z.string(),
    evaluationScore: z.number().optional(),
    isGrounded: z.boolean().optional(),
  }),
  steps: [
    decideRetrievalStep,
    enhanceQueryStep,
    getContextStep,
    generateResponseStep,
    evaluateAndRetryStep,
  ],
});

// --- Workflow Logic ---
ragWorkflow
  // 1. Trigger -> decideRetrievalStep (Runs in parallel with enhanceQueryStep)
  // This step determines the retrieval strategy and filter based on the initial user query.
  .map({ userQuery: { initData: ragWorkflow, path: "userQuery" } })
  .then(decideRetrievalStep)

  // 2. Trigger -> enhanceQueryStep (Runs in parallel with decideRetrievalStep)
  // This step generates a hypothetical document based on the initial user query.
  .map({
    userQuery: { initData: ragWorkflow, path: "userQuery" }
  })
  .then(enhanceQueryStep)

  // 3. enhanceQueryStep + decideRetrievalStep -> getContextStep
  // This step uses the hypothetical document (from enhanceQueryStep), strategy, and filter (from decideRetrievalStep)
  // to retrieve relevant context using the appropriate tool (via the retrievalAgent).
  // This step will wait for both decideRetrievalStep and enhanceQueryStep to complete.
  .map({
    userQuery: { initData: ragWorkflow, path: "userQuery" },
    queryText: { step: enhanceQueryStep, path: "hypotheticalDocument" },
    // Map the entire output object of decideRetrievalStep to the 'decision' input
    // Using path: '.' based on error messages requiring a path property
    decision: { step: decideRetrievalStep, path: '.' },
  })
  .then(getContextStep)

  // 4. Trigger + getContextStep -> generateResponseStep
  // This step generates the final answer based on the original user query and the retrieved context.
  .map({
    userQuery: { initData: ragWorkflow, path: "userQuery" },
    relevantContext: { step: getContextStep, path: "relevantContext" },
  })
  .then(generateResponseStep)

  // 5. Trigger + getContextStep + generateResponseStep -> evaluateAndRetryStep
  // This step evaluates the generated answer and handles retry logic if necessary.
  .map({
    userQuery: { initData: ragWorkflow, path: "userQuery" },
    relevantContext: { step: getContextStep, path: "relevantContext" },
    generatedAnswer: { step: generateResponseStep, path: "answer" },
  })
  .then(evaluateAndRetryStep)
  .commit();
