import { isRetryableError } from "../../utils/errorUtils";
import { createStep } from "@mastra/core/workflows/vNext";
import { z } from "zod";
import { retrievalDecisionSchema } from "../../agents";
import { RETRIEVAL_ROUTER_AGENT_NAME } from "../../agents/retrievalRouterAgent";
import { WorkflowError } from "../../errors";

// 3. Decide Retrieval Strategy
export const decideRetrievalStep = createStep({
  id: "decideRetrieval",
  inputSchema: z.object({ userQuery: z.string() }),
  outputSchema: retrievalDecisionSchema,
  execute: async ({ inputData, mastra, runtimeContext }) => {
    console.debug(`Executing step: ${decideRetrievalStep.id}`);
    try {
      const agent = mastra?.getAgent(RETRIEVAL_ROUTER_AGENT_NAME);
      if (!agent)
        throw new Error("RetrievalRouterAgent not found in Mastra instance.");

      console.log(
        "Calling Retrieval Router Agent for query:",
        inputData.userQuery
      );
      const response = await agent.generate(inputData.userQuery, {
        output: retrievalDecisionSchema,
        runtimeContext,
      });
      console.log("Retrieval Router Agent decision:", response.object);
      return response.object;
    } catch (error) {
      console.error(`Error in step ${decideRetrievalStep.id}:`, error);
      const isRetryable = isRetryableError(error);

      throw new WorkflowError(
        `Failed to decide retrieval strategy in step ${decideRetrievalStep.id}: ${error instanceof Error ? error.message : String(error)}`,
        isRetryable
      );
    }
  },
});
