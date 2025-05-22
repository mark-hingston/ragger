import { cleanEnv, str, num, bool } from "envalid";

export const env = cleanEnv(process.env, {
  QDRANT_HOST: str(),
  QDRANT_PORT: num(),
  QDRANT_COLLECTION_NAME: str(),
  QDRANT_API_KEY: str({ default: undefined }),
  QDRANT_USE_HTTPS: bool({ default: true }),
  AZURE_STORAGE_ACCOUNT_NAME: str({ default: undefined, desc: 'Azure Storage Account Name (optional, for shared key authentication)' }),
  AZURE_STORAGE_ACCOUNT_KEY: str({ default: undefined, desc: 'Azure Storage Account Key (optional, for shared key authentication)' }),
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
  
  HYBRID_SEARCH_ENABLED: bool({ default: true, desc: 'Enable hybrid (dense + sparse) search' }),
  VOCABULARY_FILE_PATH: str({ default: "./vocabulary.json", desc: 'Path or URL to the vocabulary.json file for sparse vectors' }),
  SPARSE_VECTOR_NAME: str({ default: "keyword_sparse", desc: 'Name of the sparse vector field in Qdrant' }),

  RERANKER_INITIAL_FETCH_K: num({ default: 50, desc: 'Initial number of documents to fetch for reranker' }),
  RERANKER_TOP_K: num({ default: 5, desc: 'Number of documents to return after reranking' }),

  HIERARCHICAL_TOP_N_SUMMARIES: num({ default: 3, desc: 'Number of file summaries to retrieve in hierarchical search' }),

  QUERY_TRANSFORMATION_TYPE: str({ default: 'none', choices: ['none', 'rewrite', 'sub_queries'], desc: 'Type of query transformation to apply' }),

  CONTEXTUAL_COMPRESSION_ENABLED: bool({ default: true, desc: 'Enable contextual compression of retrieved snippets' }),

});
export const QDRANT_STORE_NAME = "qdrantStore";
