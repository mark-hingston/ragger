import { createStep } from "@mastra/core/workflows/vNext";
import { z } from "zod";
import { env } from "../../../config";
import { cosineSimilarity, embed } from "ai";
import { EVALUATION_AGENT_NAME } from "../../agents/evaluationAgent";
import { RAG_AGENT_NAME } from "../../agents/ragAgent";
import { Mastra } from "@mastra/core";
import { WorkflowError } from "../../errors";
import { embeddingModel } from "../../providers";
import { isRetryableError } from "../../utils/errorUtils";

const RETRY_THRESHOLD = env.RETRY_THRESHOLD;
const MAX_CONTEXT_LENGTH = 8000; // Max characters for context to prevent overflow

// --- Helper Functions ---
async function isAnswerGrounded(
  answer: string,
  context: string,
  mastra: Mastra | undefined,
  runtimeContext: any
): Promise<boolean> {
  try {
    if (!mastra) {
      throw new Error("Mastra instance not available for groundedness check.");
    }

    if (!context || context.trim().length === 0) {
      console.warn("Groundedness check skipped: Context is empty.");
      return false;
    }

    if (!answer || answer.trim().length === 0) {
      console.warn("Groundedness check skipped: Answer is empty.");
      return false;
    }

    const [answerEmbeddingResult, contextEmbeddingResult] = await Promise.all([
      embed({
        model: embeddingModel,
        value: answer,
      }),
      embed({
        model: embeddingModel,
        value: context,
      })
    ]);

    if (!answerEmbeddingResult?.embedding || !contextEmbeddingResult?.embedding) {
      console.error(
        "Groundedness check failed: Could not generate embeddings via agent."
      );
      return false;
    }

    const similarity = cosineSimilarity(answerEmbeddingResult.embedding, contextEmbeddingResult.embedding);
    console.debug(`Groundedness similarity score: ${similarity}`);
    return similarity > env.GROUNDEDNESS_THRESHOLD;
  } catch (error) {
    console.error("Error during embedding-based groundedness check:", error);
    const isRetryable = isRetryableError(error);
    throw new WorkflowError(
      `Embedding failed during groundedness check: ${error instanceof Error ? error.message : String(error)}`,
      isRetryable
    );
  }
}

async function evaluateAnswer(
  answerToEvaluate: string,
  userQuery: string,
  relevantContext: string,
  mastra: Mastra | undefined,
  runtimeContext: any
) {
  const localEvalAgent = mastra?.getAgent(EVALUATION_AGENT_NAME);
  if (!localEvalAgent)
    throw new Error("EvaluationAgent not found in Mastra instance.");

  try {
    const expectedEvalSchema = z.object({
      accuracy: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
      completeness: z.number().min(0).max(1),
      coherence: z.number().min(0).max(1),
      overall: z.number().min(0).max(1),
      reasoning: z.string(),
    });

    const evalPrompt = `User Query: ${userQuery}\nContext:\n${relevantContext}\n\nGenerated Answer: ${answerToEvaluate}\n\nEvaluate the answer based on the context using the dimensions: accuracy, relevance, completeness, coherence. Calculate an overall score (0-1). Provide reasoning. Respond ONLY with JSON matching the schema.`;

    const result = await localEvalAgent.generate(evalPrompt, {
      output: expectedEvalSchema,
      runtimeContext,
    });

    const isGrounded = await isAnswerGrounded(
      answerToEvaluate,
      relevantContext,
      mastra,
      runtimeContext
    );

    return { score: result.object.overall, reasoning: result.object.reasoning, isGrounded, answer: answerToEvaluate };
  } catch (error) {
    console.error(`Error during evaluation:`, error);
    const isRetryable = isRetryableError(error);
    throw new WorkflowError(
      `Failed to evaluate answer: ${error instanceof Error ? error.message : String(error)}`,
      isRetryable
    );
  }
}

// 5. Evaluate Response & Conditionally Retry
export const evaluateAndRetryStep = createStep({
  id: "evaluateAndRetry",
  inputSchema: z.object({
    userQuery: z.string(),
    relevantContext: z.string(),
    generatedAnswer: z.string(),
  }),
  outputSchema: z.object({
    finalAnswer: z.string(),
    evaluationScore: z.number().optional(),
    isGrounded: z.boolean().optional(),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const runId = (runtimeContext as any)?.runId;
    console.log(`[${evaluateAndRetryStep.id}${runId ? ` | RunID: ${runId}` : ''}] Executing step...`);

    // --- Empty Context Handling ---
    if (!inputData.relevantContext || !inputData.relevantContext.trim()) {
      console.warn(`[${evaluateAndRetryStep.id}${runId ? ` | RunID: ${runId}` : ''}] Empty context received. Returning default response.`);
      return { finalAnswer: "No relevant context found to generate an answer." };
    }

    // --- Context Truncation ---
    const truncatedContext = inputData.relevantContext.slice(0, MAX_CONTEXT_LENGTH);
    if (inputData.relevantContext.length > MAX_CONTEXT_LENGTH) {
        console.warn(`[${evaluateAndRetryStep.id}${runId ? ` | RunID: ${runId}` : ''}] Context truncated from ${inputData.relevantContext.length} to ${MAX_CONTEXT_LENGTH} characters.`);
    }


    const localRagAgent = mastra?.getAgent(RAG_AGENT_NAME);
    if (!localRagAgent)
      throw new Error("RagAgent not found in Mastra instance.");

    // --- Initial Evaluation ---
    try {
      console.log("Evaluating initial response...");

      let finalEvalResult = await evaluateAnswer(
        inputData.generatedAnswer,
        inputData.userQuery,
        truncatedContext, // Use truncated context
        mastra,
        runtimeContext
      );
      console.log(
        `Initial Evaluation: Score=${finalEvalResult.score}, Grounded=${finalEvalResult.isGrounded}`
      );

      // --- Conditional Retry ---
      if (finalEvalResult.score < RETRY_THRESHOLD) {
        console.log(
          `Initial score ${finalEvalResult.score} < ${RETRY_THRESHOLD}. Regenerating response.`
        );

        const retryPrompt = `User Query: ${inputData.userQuery}\n\nContext:\n${truncatedContext}\n\nPrevious Answer (Score: ${finalEvalResult.score}): "${finalEvalResult.answer}"\nReasoning for low score: ${finalEvalResult.reasoning}\n\nPlease provide an improved answer based *only* on the provided context, addressing the reasons for the low score. Answer:`; // Use truncated context

        let regeneratedAnswer: string;
        try {
          const regenResponse = await localRagAgent.generate(retryPrompt, {
            runtimeContext,
          });
          regeneratedAnswer = regenResponse.text;
        } catch (error) {
          console.error(
            `Error during response regeneration within step ${evaluateAndRetryStep.id}:`,
            error
          );
          const isRetryableRegen = isRetryableError(error);
          throw new WorkflowError(
            `Failed to regenerate response within step ${evaluateAndRetryStep.id}: ${error instanceof Error ? error.message : String(error)}`,
            isRetryableRegen
          );
        }

        console.log("Evaluating regenerated response...");
        finalEvalResult = await evaluateAnswer(
          regeneratedAnswer,
          inputData.userQuery,
          truncatedContext, // Use truncated context
          mastra,
          runtimeContext
        );
        console.log(
          `Regenerated Evaluation: Score=${finalEvalResult.score}, Grounded=${finalEvalResult.isGrounded}`
        );
      }

      return {
        finalAnswer: finalEvalResult.answer,
        evaluationScore: finalEvalResult.score,
        isGrounded: finalEvalResult.isGrounded,
      };
    } catch (error) {
      console.error(
        `Error in step ${evaluateAndRetryStep.id} (main execution):`,
        error
      );
      const isRetryableMain = isRetryableError(error);
      throw new WorkflowError(
        `An unexpected error occurred in step ${evaluateAndRetryStep.id}: ${error instanceof Error ? error.message : String(error)}`,
        isRetryableMain
      );
    }
  },
});
