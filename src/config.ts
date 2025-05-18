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
  // HYDE_ENABLED: bool({ default: true, desc: 'Enable Hypothetical Document Embeddings (HyDE)' }), // R1.1: Removed
  
  // R1.2: Hybrid Search configuration
  HYBRID_SEARCH_ENABLED: bool({ default: true, desc: 'Enable hybrid (dense + sparse) search' }),
  VOCABULARY_FILE_PATH: str({ default: "./vocabulary.json", desc: 'Path to the vocabulary file for sparse vectors' }),
  SPARSE_VECTOR_NAME: str({ default: "keyword_sparse", desc: 'Name of the sparse vector field in Qdrant' }),

  // R1.4: Reranker configuration
  RERANKER_INITIAL_FETCH_K: num({ default: 50, desc: 'Initial number of documents to fetch for reranker' }),
  RERANKER_TOP_K: num({ default: 5, desc: 'Number of documents to return after reranking' }),

  // R2.1: Hierarchical Retrieval configuration
  HIERARCHICAL_TOP_N_SUMMARIES: num({ default: 3, desc: 'Number of file summaries to retrieve in hierarchical search' }),

  // R3.1: Query Transformation configuration
  QUERY_TRANSFORMATION_TYPE: str({ default: 'none', choices: ['none', 'rewrite', 'sub_queries'], desc: 'Type of query transformation to apply' }),

  // R3.2: Contextual Compression configuration
  CONTEXTUAL_COMPRESSION_ENABLED: bool({ default: true, desc: 'Enable contextual compression of retrieved snippets' }),

});
export const QDRANT_STORE_NAME = "qdrantStore";
