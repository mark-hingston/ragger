import { createStep } from "@mastra/core/workflows/vNext";
import { z } from "zod";
import { retrievalDecisionSchema, RETRIEVAL_AGENT_NAME } from "../../agents";
import { WorkflowError } from "../../errors";
import { isRetryableError } from "../../utils/errorUtils";

const inputSchema = z.object({
  userQuery: z.string(),
  queryText: z.string(),
  strategy: retrievalDecisionSchema.shape.strategy,
  filter: z.record(z.any()).nullable(),
});

const outputSchema = z.object({ relevantContext: z.string() });

type InputType = z.infer<typeof inputSchema>;
type OutputType = z.infer<typeof outputSchema>;


// 2. Get Context (Using Retrieval Agent)
export const getContextStep = createStep({
  id: "getContext",
  inputSchema: inputSchema,
  outputSchema: outputSchema,
  execute: async ({ inputData, runtimeContext, mastra }): Promise<OutputType> => {
    const stepId = "getContext";
    console.debug(`Executing step: ${stepId}`);
    try {
      if (!mastra) {
        throw new Error("Mastra instance not available in step context.");
      }

      const { strategy, queryText: hypotheticalDocument, filter, userQuery } = inputData as InputType;

      console.log(`Getting context using strategy: ${strategy}`);
      console.log(`DEBUG [getContextStep]: Input received: ${JSON.stringify(inputData, null, 2)}`);

      const agent = mastra.getAgent(RETRIEVAL_AGENT_NAME);
      if (!agent) {
        throw new Error(`Agent '${RETRIEVAL_AGENT_NAME}' not found.`);
      }

      let toolName: string;
      let toolArgs: Record<string, any>;
      let response: any;

      if (strategy === 'graph') {
        console.log(`Preparing graphRAGTool call for strategy 'graph'`);
        toolName = 'graphRAGTool';
        toolArgs = { queryText: hypotheticalDocument };
      } else {
        // Default to vectorQueryTool for other strategies
        console.log(`Preparing vectorQueryTool call for strategy '${strategy}'`);
        toolName = 'vectorQueryTool';
        toolArgs = { queryText: hypotheticalDocument, filter: filter };
      }

      // Execute the tool call, passing args in the message content
      response = await agent.generate([{
        role: 'user',
        content: JSON.stringify({ tool: toolName, args: toolArgs })
      }], {
        runtimeContext,
        toolChoice: { type: 'tool', toolName: toolName },
      });

      // Fallback: if no context with filter, try without filter
      if (strategy !== 'graph' && response.object?.length === 0 && filter && Object.keys(filter).length > 0) {
        console.warn(`No context found with filter for strategy '${strategy}'. Retrying without filter.`);
        toolName = 'vectorQueryTool';
        toolArgs = { queryText: hypotheticalDocument };

        response = await agent.generate([{
          role: 'user',
          content: JSON.stringify({ tool: toolName, args: toolArgs })
        }], {
          runtimeContext,
          toolChoice: { type: 'tool', toolName: toolName },
        });
      }

      // Format the context
      let finalContext = "";
      const contextItems = response.object;

      if (Array.isArray(contextItems)) {
          finalContext = contextItems.map(item => {
              const filePath = item.metadata?.filePath || 'unknown file';
              const content = item.content || '';
              return `File: ${filePath}\n\`\`\`\n${content}\n\`\`\`\n---\n`;
          }).join('');
      } else if (typeof response.text === 'string' && response.text.trim() !== '') {
           // Fallback if structured data isn't available but text is
           console.warn("Tool result was not structured as expected. Using raw text result.");
           finalContext = response.text;
      }

      if (finalContext === "") {
          console.warn(`No relevant context found by strategy '${strategy}'.`);
      }

      return { relevantContext: finalContext };
    } catch (error) {
      console.error(`Error in step ${stepId}:`, error);
      const isRetryable = isRetryableError(error);

      throw new WorkflowError(
        `Failed to get context in step ${stepId}: ${error instanceof Error ? error.message : String(error)}`,
        isRetryable
      );
    }
  },
});
