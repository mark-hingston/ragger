import { createStep } from "@mastra/core/workflows/vNext";
import { z } from "zod";
import { CONTEXT_COMPRESSOR_AGENT_NAME } from "../../agents/contextCompressorAgent";
import { WorkflowError } from "../../errors";
import { isRetryableError } from "../../utils/errorUtils";
import { env } from "../../../config";

// Helper to parse the string context back into snippets
function parseContextSnippets(contextString: string): { filePath: string; content: string }[] {
    const snippets = [];
    const snippetRegex = /File: (.*?)\n```\n(.*?)\n```\n---/gs;
    let match;
    while ((match = snippetRegex.exec(contextString)) !== null) {
        snippets.push({ filePath: match[1].trim(), content: match[2].trim() });
    }
    return snippets;
}


export const compressContextStep = createStep({
  id: "compressContext",
  inputSchema: z.object({
    userQuery: z.string(),
    relevantContext: z.string(), // This is the stringified context from getContextStep
  }),
  outputSchema: z.object({
    finalCompressedContext: z.string(),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    console.debug(`Executing step: ${compressContextStep.id}`);
    const { userQuery, relevantContext } = inputData;

    if (!env.CONTEXTUAL_COMPRESSION_ENABLED) {
      console.log("[CompressContextStep] Contextual compression is disabled. Using original context.");
      return { finalCompressedContext: relevantContext };
    }

    if (!relevantContext || relevantContext.trim() === "") {
        console.log("[CompressContextStep] No context to compress.");
        return { finalCompressedContext: "" };
    }

    try {
      const agent = mastra?.getAgent(CONTEXT_COMPRESSOR_AGENT_NAME);
      if (!agent) {
        throw new Error(`Agent '${CONTEXT_COMPRESSOR_AGENT_NAME}' not found.`);
      }

      const snippets = parseContextSnippets(relevantContext);
      if (snippets.length === 0) {
        console.log("[CompressContextStep] Could not parse any snippets from context. Using original context.");
        return { finalCompressedContext: relevantContext };
      }

      const compressedSnippets: string[] = [];
      console.log(`[CompressContextStep] Compressing ${snippets.length} context snippets...`);

      for (const snippet of snippets) {
        const prompt = `User Query: ${userQuery}\n\nContext Snippet (from file ${snippet.filePath}):\n${snippet.content}\n\nRelevant parts:`;
        try {
            const response = await agent.generate(prompt, {
                output: z.object({ compressedSnippet: z.string() }),
                runtimeContext,
            });
            if (response.object.compressedSnippet.trim() !== "") {
                compressedSnippets.push(`File: ${snippet.filePath}\n\`\`\`\n${response.object.compressedSnippet.trim()}\n\`\`\`\n---`);
            }
        } catch (compressionError) {
            console.warn(`[CompressContextStep] Error compressing snippet from ${snippet.filePath}: ${compressionError}. Skipping this snippet.`);
        }
      }

      const finalCompressedContext = compressedSnippets.join('');
      console.log(`[CompressContextStep] Compression complete. Original length: ${relevantContext.length}, Compressed length: ${finalCompressedContext.length}`);
      return { finalCompressedContext };

    } catch (error) {
      console.error(`Error in step ${compressContextStep.id}:`, error);
      const isRetryable = isRetryableError(error);
      throw new WorkflowError(
        `Failed to compress context in step ${compressContextStep.id}: ${error instanceof Error ? error.message : String(error)}`,
        isRetryable
      );
    }
  },
});