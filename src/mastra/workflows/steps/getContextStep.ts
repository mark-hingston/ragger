import { createStep } from "@mastra/core/workflows/vNext";
import { z } from "zod";
import { retrievalDecisionSchema, RETRIEVAL_AGENT_NAME } from "../../agents";
import { WorkflowError } from "../../errors";
import { isRetryableError } from "../../utils/errorUtils";
// Placeholder for vocabulary and query processing logic
// In a real scenario, these would be properly imported or managed.
import { loadVocabulary, processQueryForSparseVector } from "../../utils/sparseVectorHelper";
import { env } from "../../../config";

// Expect the full decision object from the previous step
const inputSchema = z.object({
  userQuery: z.string(),
  // queryText is the original userQuery, as HyDE is removed.
  // If HyDE were present, queryText would be the hypotheticalDocument.
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
    let queryTextForRetrieval: string | undefined; // This will be the original user query
    let filter: z.infer<typeof retrievalDecisionSchema>['filter'] | undefined;
    let userQuery: string | undefined;

    try {
      if (!mastra) {
        throw new Error("Mastra instance not available in step context.");
      }

      // Destructure from the input, including the nested decision object
      // queryText from inputData is now the original userQuery because HyDE is removed.
      const { decision, queryText: transformedQueryForRetrieval, userQuery: originalQueryFromWorkflowStart } = inputData;
      strategy = decision.strategy;
      filter = decision.filter;
      queryTextForRetrieval = transformedQueryForRetrieval; // Use transformed query for retrieval
      userQuery = originalQueryFromWorkflowStart; // This is the original query from workflow start


      // Ensure strategy is defined before using it
      if (!strategy) {
        throw new Error("Strategy is undefined after destructuring inputData.");
      }

      console.log(`Getting context using strategy: ${strategy}`);
      console.log(`DEBUG [getContextStep]: Input received: ${JSON.stringify(inputData, null, 2)}`);
      console.log(`DEBUG [getContextStep]: Query text for retrieval: ${queryTextForRetrieval}`);


      const agent = mastra.getAgent(RETRIEVAL_AGENT_NAME);
      if (!agent) {
        throw new Error(`Agent '${RETRIEVAL_AGENT_NAME}' not found.`);
      }

      let toolName: string;
      let toolArgs: Record<string, any>;
      let response: any;

      // --- Sparse Vector Generation for queryTextForRetrieval ---
      let querySparseVector;
      if (env.HYBRID_SEARCH_ENABLED && queryTextForRetrieval) { // Assuming HYBRID_SEARCH_ENABLED config
        try {
            const vocabulary = await loadVocabulary(env.VOCABULARY_FILE_PATH); // Load vocab
            if (vocabulary) {
                querySparseVector = processQueryForSparseVector(queryTextForRetrieval, vocabulary, 'keyword_sparse');
                console.log(`[getContextStep] Generated sparse vector for query: ${JSON.stringify(querySparseVector)}`);
            } else {
                console.warn("[getContextStep] Vocabulary not loaded. Proceeding with dense search only.");
            }
        } catch (e) {
            console.error(`[getContextStep] Error generating sparse vector: ${e}. Proceeding with dense search only.`);
        }
      }
      // --- End Sparse Vector Generation ---

      if (strategy === 'graph') {
        console.log(`Preparing graphRAGTool call for strategy 'graph'`);
        toolName = 'graphRAGTool';
        // GraphRAGTool might not use sparse vectors directly, uses dense for node similarity.
        toolArgs = { queryText: queryTextForRetrieval };
      } else if (strategy === 'hierarchical') {
        console.log(`Executing hierarchical retrieval for strategy 'hierarchical'`);
        // Step A: Query File Summaries
        const summaryFilter = { "must": [{ "key": "documentType", "match": { "value": "file_summary" } }] };
        let summarySparseVector;
        if (env.HYBRID_SEARCH_ENABLED && queryTextForRetrieval) {
            // Re-use or re-generate sparse vector for summary query if needed, or assume same as main query
            summarySparseVector = querySparseVector;
        }

        console.log(`[Hierarchical] Querying file summaries with filter: ${JSON.stringify(summaryFilter)}`);
        const summaryResponse = await agent.generate([{
            role: 'user',
            content: JSON.stringify({
                tool: 'vectorQueryTool',
                args: { queryText: queryTextForRetrieval, filter: summaryFilter, querySparseVector: summarySparseVector }
            })
        }], { runtimeContext, toolChoice: { type: 'tool', toolName: 'vectorQueryTool' } });

        const summaryToolResults = summaryResponse.toolResults;
        const topNFilePaths: string[] = [];
        if (Array.isArray(summaryToolResults)) {
            summaryToolResults.forEach(toolResult => {
                if (toolResult.toolName === 'vectorQueryTool' && toolResult.result) {
                    const summaries = Array.isArray(toolResult.result) ? toolResult.result : (Array.isArray(toolResult.result.relevantContext) ? toolResult.result.relevantContext : []);
                    summaries.slice(0, env.HIERARCHICAL_TOP_N_SUMMARIES).forEach((summary: any) => { // env.HIERARCHICAL_TOP_N_SUMMARIES e.g., 3
                        if (summary.metadata?.source) {
                            topNFilePaths.push(summary.metadata.source);
                        }
                    });
                }
            });
        }
        console.log(`[Hierarchical] Top ${topNFilePaths.length} file paths from summaries: ${topNFilePaths.join(', ')}`);

        // Step B: Query Chunks from Relevant Files
        let allChunks: any[] = [];
        if (topNFilePaths.length > 0) {
            const chunkFilter = {
                "must": [
                    { "key": "documentType", "match": { "value": "chunk_detail" } },
                    { "key": "source", "match": { "any": topNFilePaths } } // Qdrant $in equivalent
                ]
            };
            console.log(`[Hierarchical] Querying chunks with filter: ${JSON.stringify(chunkFilter)}`);
            const chunkResponse = await agent.generate([{
                role: 'user',
                content: JSON.stringify({
                    tool: 'vectorQueryTool',
                    args: { queryText: queryTextForRetrieval, filter: chunkFilter, querySparseVector: querySparseVector }
                })
            }], { runtimeContext, toolChoice: { type: 'tool', toolName: 'vectorQueryTool' } });

            const chunkToolResults = chunkResponse.toolResults;
            if (Array.isArray(chunkToolResults)) {
                 chunkToolResults.forEach(toolResult => {
                    if (toolResult.toolName === 'vectorQueryTool' && toolResult.result) {
                        const chunks = Array.isArray(toolResult.result) ? toolResult.result : (Array.isArray(toolResult.result.relevantContext) ? toolResult.result.relevantContext : []);
                        allChunks.push(...chunks);
                    }
                });
            }
        }
        console.log(`[Hierarchical] Retrieved ${allChunks.length} chunks from relevant files.`);
        // Step C: Combine & Rerank (if needed, or rely on vectorQueryTool's internal reranker)
        // For now, vectorQueryTool handles reranking internally. We just pass the combined chunks.
        // The `response` object will be built from `allChunks` later.
        // To simulate the structure `vectorQueryTool` would return for formatting:
        response = { toolResults: [{ toolName: 'vectorQueryTool', result: allChunks }] };
        toolName = 'vectorQueryTool'; // For consistent formatting later

      } else {
        // Default to vectorQueryTool for other strategies
        console.log(`Preparing vectorQueryTool call for strategy '${strategy}'`);
        toolName = 'vectorQueryTool';
        toolArgs = { queryText: queryTextForRetrieval, filter: filter };
        if (querySparseVector) {
            toolArgs.querySparseVector = querySparseVector;
        }
        response = await agent.generate([{
          role: 'user',
          content: JSON.stringify({ tool: toolName, args: toolArgs })
        }], {
          runtimeContext,
          toolChoice: { type: 'tool', toolName: toolName },
        });
      }


      // Fallback: if no context with filter (and not graph/hierarchical), try without filter
      const currentResponseItems = response.toolResults?.[0]?.result;
      const noResultsFromFilteredSearch = Array.isArray(currentResponseItems) && currentResponseItems.length === 0;

      if (strategy !== 'graph' && strategy !== 'hierarchical' && noResultsFromFilteredSearch && filter && Object.keys(filter).length > 0) {
        console.warn(`No context found with filter for strategy '${strategy}'. Retrying without filter.`);
        console.log(`Fallback retrieval triggered for query: ${userQuery}`);
        toolName = 'vectorQueryTool';
        toolArgs = { queryText: queryTextForRetrieval }; // No filter
        if (querySparseVector) { // Still use sparse vector if available
            toolArgs.querySparseVector = querySparseVector;
        }

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
          const allContextItems = toolResults.flatMap(toolResult => {
              if (toolResult.toolName === toolName && toolResult.result) {
                  // Check if result itself is the array (e.g., graph tool or hierarchical result)
                  if (ArrayResult(toolResult.result)) {
                      return toolResult.result;
                  }
                  // Check if result.relevantContext is the array (e.g., vector tool's typical output structure)
                  // This part might be redundant if vectorQueryTool's output is now directly an array.
                  if (toolResult.result.relevantContext && ArrayResult(toolResult.result.relevantContext)) {
                      return toolResult.result.relevantContext;
                  }
              }
              return [];
          });

          if (Array.isArray(allContextItems) && allContextItems.length > 0) {
              finalContext = allContextItems.map((item: any) => {
                  const filePath = item.source || item.metadata?.source || item.metadata?.filePath || 'unknown file';
                  const content = item.text || item.content || '';
                  return `File: ${filePath}\n\`\`\`\n${content}\n\`\`\`\n---\n`;
              }).join('');
          }
      } else if (typeof response.text === 'string' && response.text.trim() !== '') {
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
        `Failed to get context in step ${stepId} with strategy '${strategy}': ${error instanceof Error ? error.message : String(error)}`,
        isRetryable
      );
    }
  },
});

// Helper function to check if something is an array and not null/undefined
function ArrayResult(value: any): value is Array<any> {
    return Array.isArray(value);
}
