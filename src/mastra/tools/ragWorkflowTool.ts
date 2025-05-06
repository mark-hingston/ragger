import { createTool } from "@mastra/core/tools";
import { RAG_WORKFLOW_ID, ragWorkflow } from "../workflows/ragWorkflow";

export const ragWorkflowTool = createTool({
  id: "triggerRagWorkflowTool",
  description: "Triggers the RAG workflow to process the user's query and get a comprehensive answer.",
  inputSchema: ragWorkflow.inputSchema,
  outputSchema: ragWorkflow.outputSchema,
  execute: async ({ context, mastra }) => {
    const workflow = mastra?.vnext_getWorkflow(RAG_WORKFLOW_ID);

    if (!workflow) {
      throw new Error("Workflow not found.");
    }
    
    try {
      const run = ragWorkflow.createRun();
      const results = await run.start({
        inputData: {
          userQuery: context.userQuery
        },
      });
      
      if (results.status !== "success")
        throw new Error(`Workflow execution failed`);

      const evaluateAndRetryResult = results.steps.evaluateAndRetry;

      if (evaluateAndRetryResult.status === "success") {
        return evaluateAndRetryResult.output;
      } else {
        
        if (evaluateAndRetryResult.status === "failed") {
          throw new Error(`RAG workflow step 'evaluateAndRetry' failed: ${evaluateAndRetryResult.error}`);
        } else {
          throw new Error(`RAG workflow step 'evaluateAndRetry' was not successful (status: ${evaluateAndRetryResult.status})`);
        }
      }

    } catch (error) {
      console.error("Error executing RAG workflow via tool:", error);
      throw new Error(`Failed to process query through RAG workflow: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});