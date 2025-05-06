import { isRetryableError } from "../../utils/errorUtils";
import { createStep } from "@mastra/core/workflows/vNext";
import { z } from "zod";
import { RAG_AGENT_NAME } from "../../agents/ragAgent";
import { WorkflowError } from "../../errors";

// 4. Generate Response (Initial)
export const generateResponseStep = createStep({
  id: "generateResponse",
  inputSchema: z.object({
    userQuery: z.string(),
    relevantContext: z.string(),
  }),
  outputSchema: z.object({ answer: z.string() }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    console.debug(`Executing step: ${generateResponseStep.id}`);
    try {
      const agent = mastra?.getAgent(RAG_AGENT_NAME);
      if (!agent) throw new Error("RagAgent not found in Mastra instance.");

      const { userQuery, relevantContext } = inputData;
      const prompt = `User Query: ${userQuery}\n\nContext:\n${relevantContext}\n\nAnswer:`;
      const response = await agent.generate(prompt, { runtimeContext });
      return { answer: response.text };
    } catch (error) {
      console.error(`Error in step ${generateResponseStep.id}:`, error);
      const isRetryable = isRetryableError(error);

      throw new WorkflowError(
        `Failed to generate initial response in step ${generateResponseStep.id}: ${error instanceof Error ? error.message : String(error)}`,
        isRetryable
      );
    }
  },
});
