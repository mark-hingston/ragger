import { isRetryableError } from "../../utils/errorUtils";
import { createStep } from "@mastra/core/workflows/vNext";
import { z } from "zod";
import { QUERY_ENHANCER_AGENT_NAME } from "../../agents/queryEnhancerAgent";
import { WorkflowError } from "../../errors";

// 1. Enhance Query (HyDE)
export const enhanceQueryStep = createStep({
  id: "enhanceQuery",
  inputSchema: z.object({
    userQuery: z.string()
  }),
  outputSchema: z.object({ hypotheticalDocument: z.string() }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    console.debug(`Executing step: ${enhanceQueryStep.id}`);
    try {
      const agent = mastra?.getAgent(QUERY_ENHANCER_AGENT_NAME);
      if (!agent)
        throw new Error("QueryEnhancerAgent not found in Mastra instance.");
      const response = await agent.generate(inputData.userQuery, {
        output: z.object({ hypotheticalDocument: z.string() }),
        runtimeContext,
      });
      return { hypotheticalDocument: response.object.hypotheticalDocument };
    } catch (error) {
      console.error(`Error in step ${enhanceQueryStep.id}:`, error);
      const isRetryable = isRetryableError(error);

      throw new WorkflowError(
        `Failed to enhance query in step ${enhanceQueryStep.id}: ${error instanceof Error ? error.message : String(error)}`,
        isRetryable
      );
    }
  },
});
