import { createStep } from "@mastra/core/workflows/vNext";
import { z } from "zod";
import { QUERY_TRANSFORMER_AGENT_NAME } from "../../agents/queryTransformerAgent";
import { WorkflowError } from "../../errors";
import { isRetryableError } from "../../utils/errorUtils";
import { env } from "../../../config";

export const transformQueryStep = createStep({
  id: "transformQuery",
  inputSchema: z.object({
    userQuery: z.string(),
  }),
  // Output can be a single string or an object with sub-queries
  outputSchema: z.object({
    transformedQuery: z.string(), // For simplicity, assume single string output for now
    // originalQuery: z.string(),
    // subQueries: z.array(z.string()).nullable(),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    console.debug(`Executing step: ${transformQueryStep.id}`);
    const { userQuery } = inputData;

    if (env.QUERY_TRANSFORMATION_TYPE === 'none') {
      console.log("[TransformQueryStep] Query transformation is disabled. Using original query.");
      return { transformedQuery: userQuery };
    }

    try {
      const agent = mastra?.getAgent(QUERY_TRANSFORMER_AGENT_NAME);
      if (!agent) {
        throw new Error(`Agent '${QUERY_TRANSFORMER_AGENT_NAME}' not found.`);
      }

      console.log(`[TransformQueryStep] Transforming query: "${userQuery}" using type: ${env.QUERY_TRANSFORMATION_TYPE}`);
      // The agent's prompt should be designed to handle different transformation types
      const response = await agent.generate(
        `User Query: ${userQuery}\nTransformation Type: ${env.QUERY_TRANSFORMATION_TYPE}`,
        {
          // Adjust output schema based on agent's capability for sub-queries if implemented
          output: z.object({ rewrittenQuery: z.string() }),
          runtimeContext,
        }
      );

      console.log(`[TransformQueryStep] Transformed query: "${response.object.rewrittenQuery}"`);
      return { transformedQuery: response.object.rewrittenQuery };

    } catch (error) {
      console.error(`Error in step ${transformQueryStep.id}:`, error);
      const isRetryable = isRetryableError(error);
      throw new WorkflowError(
        `Failed to transform query in step ${transformQueryStep.id}: ${error instanceof Error ? error.message : String(error)}`,
        isRetryable
      );
    }
  },
});