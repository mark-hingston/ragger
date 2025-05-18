import { Agent } from "@mastra/core/agent";
import { ragWorkflowTool } from "../tools/ragWorkflowTool";
import { rerankModel } from "../providers";

export const workflowAgent = new Agent({
  name: "workflowAgent",
  instructions: [
    "You MUST always use the 'triggerRagWorkflow' tool to process the user's query.",
    "Do not attempt to answer directly; always use the tool.",
  ].join("\n"),
  tools: {
    ragWorkflowTool,
  },
  model: rerankModel
});