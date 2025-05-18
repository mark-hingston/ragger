import { createWorkflow } from "@mastra/core/workflows/vNext";
import { z } from "zod";

// import { enhanceQueryStep } from "./steps/enhanceQueryStep"; // R1.1: Removed
import { getContextStep } from "./steps/getContextStep";
import { decideRetrievalStep } from "./steps/decideRetrievalStep";
import { generateResponseStep } from "./steps/generateResponseStep";
import { evaluateAndRetryStep } from "./steps/evaluateAndRetryStep";
import { transformQueryStep } from "./steps/transformQueryStep"; // R3.1: Added
import { compressContextStep } from "./steps/compressContextStep"; // R3.2: Added

export const RAG_WORKFLOW_ID = "ragWorkflow";

// --- Workflow Definition ---
export const ragWorkflow = createWorkflow({
  id: RAG_WORKFLOW_ID,
  inputSchema: z.object({
    userQuery: z.string(),
  }),
  outputSchema: z.object({
    finalAnswer: z.string(),
    evaluationScore: z.number().optional(),
    isGrounded: z.boolean().optional(),
  }),
  steps: [
    transformQueryStep,   // R3.1: Added
    decideRetrievalStep,
    // enhanceQueryStep,  // R1.1: Removed
    getContextStep,
    compressContextStep,  // R3.2: Added
    generateResponseStep,
    evaluateAndRetryStep,
  ],
});

// --- Workflow Logic ---
ragWorkflow
  // 1. Trigger -> transformQueryStep (New step for query transformation)
  .map({ userQuery: { initData: ragWorkflow, path: "userQuery" } })
  .then(transformQueryStep)

  // 2. transformQueryStep -> decideRetrievalStep
  // This step determines the retrieval strategy and filter based on the (potentially transformed) user query.
  .map({ userQuery: { step: transformQueryStep, path: "transformedQuery" } }) // Use transformed query
  .then(decideRetrievalStep)

  // 3. transformQueryStep + decideRetrievalStep -> getContextStep
  // queryText for getContextStep is now the transformedQuery.
  .map({
    userQuery: { initData: ragWorkflow, path: "userQuery" }, // Keep original for reference if needed by other steps
    queryText: { step: transformQueryStep, path: "transformedQuery" }, // Use transformed query for retrieval
    decision: { step: decideRetrievalStep, path: '.' },
  })
  .then(getContextStep)

  // 4. getContextStep + transformQueryStep -> compressContextStep (New step for context compression)
  .map({
    userQuery: { step: transformQueryStep, path: "transformedQuery" }, // Use transformed query for compression context
    relevantContext: { step: getContextStep, path: "relevantContext" },
  })
  .then(compressContextStep)

  // 5. transformQueryStep + compressContextStep -> generateResponseStep
  // This step generates the final answer based on the (potentially transformed) user query and the (compressed) retrieved context.
  .map({
    userQuery: { step: transformQueryStep, path: "transformedQuery" }, // Use transformed query for generation
    relevantContext: { step: compressContextStep, path: "finalCompressedContext" }, // Use compressed context
  })
  .then(generateResponseStep)

  // 6. transformQueryStep + compressContextStep + generateResponseStep -> evaluateAndRetryStep
  // This step evaluates the generated answer and handles retry logic if necessary.
  .map({
    userQuery: { step: transformQueryStep, path: "transformedQuery" }, // Use transformed query for evaluation
    relevantContext: { step: compressContextStep, path: "finalCompressedContext" }, // Use compressed context for evaluation
    generatedAnswer: { step: generateResponseStep, path: "answer" },
  })
  .then(evaluateAndRetryStep)
  .commit();
