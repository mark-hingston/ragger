import { createAzure } from '@ai-sdk/azure';
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "../config";

export const llmProvider = createAzure({
  resourceName: env.LLM_PROVIDER_RESOURCE_NAME,
  apiKey: env.LLM_PROVIDER_API_KEY,
});
export const llmModel = llmProvider(env.LLM_DEPLOYMENT);
export const rerankModel = llmProvider(env.RERANK_DEPLOYMENT);

export const embeddingProvider = createOpenAICompatible({
  name: env.EMBEDDING_PROVIDER_NAME,
  baseURL: env.EMBEDDING_PROVIDER_BASE_URL,
  apiKey: env.EMBEDDING_PROVIDER_API_KEY,
});
export const embeddingModel = embeddingProvider.textEmbeddingModel(
  env.EMBEDDING_MODEL
);
