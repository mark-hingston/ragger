
import { createStep } from "@mastra/core/workflows/vNext";
import { z } from "zod";
import { retrievalDecisionSchema, RETRIEVAL_AGENT_NAME } from "../../agents";
import { WorkflowError } from "../../errors";
import { isRetryableError } from "../../utils/errorUtils";

// Expect the full decision object from the previous step
const inputSchema = z.object({
  userQuery: z.string(),
  queryText: z.string(),
  decision: retrievalDecisionSchema, // Expect the whole refined schema object
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
    let strategy: z.infer<typeof retrievalDecisionSchema>['strategy'] | undefined;
    let hypotheticalDocument: string | undefined;
    let filter: z.infer<typeof retrievalDecisionSchema>['filter'] | undefined;
    let userQuery: string | undefined;

    try {
      if (!mastra) {
        throw new Error("Mastra instance not available in step context.");
      }

      // Destructure from the input, including the nested decision object
      const { decision, queryText: localQueryText, userQuery: localUserQuery } = inputData;
      strategy = decision.strategy;
      filter = decision.filter;
      hypotheticalDocument = localQueryText;
      userQuery = localUserQuery;


      // Ensure strategy is defined before using it
      if (!strategy) {
        throw new Error("Strategy is undefined after destructuring inputData.");
      }

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
      // Pass structured tool arguments directly
      // Revert to original generate call format (stringified JSON in content)
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
console.log(`Fallback retrieval triggered for query: ${userQuery}`);
        toolName = 'vectorQueryTool';
        toolArgs = { queryText: hypotheticalDocument };

        // Pass structured tool arguments directly for fallback
        // Revert to original generate call format for fallback
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
      const toolResults = response.toolResults;

      if (Array.isArray(toolResults)) {
          // Process tool results, handling potential structure differences
          const allContextItems = toolResults.flatMap(toolResult => {
              if (toolResult.toolName === toolName && toolResult.result) {
                  // Check if result itself is the array (e.g., graph tool)
                  if (Array.isArray(toolResult.result)) {
                      return toolResult.result;
                  }
                  // Check if result.relevantContext is the array (e.g., vector tool)
                  if (Array.isArray(toolResult.result.relevantContext)) {
                      return toolResult.result.relevantContext;
                  }
              }
              return []; // Return empty array if no relevant context found in this result
          });

          if (Array.isArray(allContextItems) && allContextItems.length > 0) {
              finalContext = allContextItems.map((item: any) => {
                  // Adaptively get source and text/content based on potential properties
                  const filePath = item.source || item.metadata?.filePath || 'unknown file';
                  const content = item.text || item.content || ''; // Check both 'text' and 'content'
                  return `File: ${filePath}\n\`\`\`\n${content}\n\`\`\`\n---\n`;
              }).join('');
          }
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

      // Include strategy in the error message for better context
      throw new WorkflowError(
        `Failed to get context in step ${stepId} with strategy '${strategy}': ${error instanceof Error ? error.message : String(error)}`,
        isRetryable
      );
    }
  },
});
