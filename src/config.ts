import { cleanEnv, str, num, bool } from "envalid";

export const env = cleanEnv(process.env, {
  QDRANT_HOST: str(),
  QDRANT_PORT: num(),
  QDRANT_COLLECTION_NAME: str(),
  QDRANT_API_KEY: str({ default: undefined }),
  QDRANT_USE_HTTPS: bool({ default: true }),
  EMBEDDING_PROVIDER_NAME: str(),
  EMBEDDING_PROVIDER_BASE_URL: str(),
  EMBEDDING_PROVIDER_API_KEY: str(),
  EMBEDDING_MODEL: str(),
  EMBEDDING_DIMENSIONS: num(),
  LLM_PROVIDER_RESOURCE_NAME: str(),
  LLM_PROVIDER_API_KEY: str(),
  LLM_DEPLOYMENT: str(),
  RERANK_DEPLOYMENT: str(),
  RETRY_THRESHOLD: num({ default: 0.6 }),
  GROUNDEDNESS_THRESHOLD: num({ default: 0.7, desc: 'Cosine similarity threshold for groundedness check' }),
  HYDE_ENABLED: bool({ default: true, desc: 'Enable Hypothetical Document Embeddings (HyDE)' }),
});
export const QDRANT_STORE_NAME = "qdrantStore";
