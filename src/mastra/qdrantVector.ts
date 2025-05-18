/*
 * Copyright (c) 2025 Mastra AI, Inc.
 *
 * Licensed under the Elastic License 2.0 (ELv2);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.elastic.co/licensing/elastic-license
 *
 * # Elastic License 2.0 (ELv2)
 *
 * Copyright (c) 2025 Mastra AI, Inc.
 *
 * **Acceptance**
 * By using the software, you agree to all of the terms and conditions below.
 *
 * **Copyright License**
 * The licensor grants you a non-exclusive, royalty-free, worldwide, non-sublicensable, non-transferable license to use, copy, distribute, make available, and prepare derivative works of the software, in each case subject to the limitations and conditions below
 *
 * **Limitations**
 * You may not provide the software to third parties as a hosted or managed service, where the service provides users with access to any substantial set of the features or functionality of the software.
 *
 * You may not move, change, disable, or circumvent the license key functionality in the software, and you may not remove or obscure any functionality in the software that is protected by the license key.
 *
 * You may not alter, remove, or obscure any licensing, copyright, or other notices of the licensor in the software. Any use of the licensor’s trademarks is subject to applicable law.
 *
 * **Patents**
 * The licensor grants you a license, under any patent claims the licensor can license, or becomes able to license, to make, have made, use, sell, offer for sale, import and have imported the software, in each case subject to the limitations and conditions in this license. This license does not cover any patent claims that you cause to be infringed by modifications or additions to the software. If you or your company make any written claim that the software infringes or contributes to infringement of any patent, your patent license for the software granted under these terms ends immediately. If your company makes such a claim, your patent license ends immediately for work on behalf of your company.
 *
 * **Notices**
 * You must ensure that anyone who gets a copy of any part of the software from you also gets a copy of these terms.
 *
 * If you modify the software, you must include in any modified copies of the software prominent notices stating that you have modified the software.
 *
 * **No Other Rights**
 * These terms do not imply any licenses other than those expressly granted in these terms.
 *
 * **Termination**
 * If you use the software in violation of these terms, such use is not licensed, and your licenses will automatically terminate. If the licensor provides you with a notice of your violation, and you cease all violation of this license no later than 30 days after you receive that notice, your licenses will be reinstated retroactively. However, if you violate these terms after such reinstatement, any additional violation of these terms will cause your licenses to terminate automatically and permanently.
 *
 * **No Liability**
 * As far as the law allows, the software comes as is, without any warranty or condition, and the licensor will not be liable to you for any damages arising out of these terms or the use or nature of the software, under any kind of legal claim.
 *
 * **Definitions**
 * The _licensor_ is the entity offering these terms, and the _software_ is the software the licensor makes available under these terms, including any portion of it.
 *
 * _you_ refers to the individual or entity agreeing to these terms.
 *
 * _your company_ is any legal entity, sole proprietorship, or other kind of organization that you work for, plus all organizations that have control over, are under the control of, or are under common control with that organization. _control_ means ownership of substantially all the assets of an entity, or the power to direct its management and policies by vote, contract, or otherwise. Control can be direct or indirect.
 *
 * _your licenses_ are all the licenses granted to you for the software under these terms.
 *
 * _use_ means anything you do with the software requiring one of your licenses.
 *
 * _trademark_ means trademarks, service marks, and similar rights.
 */

import { MastraVector } from "@mastra/core/vector";
import type {
  QueryResult,
  IndexStats,
  CreateIndexParams,
  UpsertVectorParams,
  QueryVectorParams, // Will be replaced by extended version
  ParamsToArgs,
} from "@mastra/core/vector";
import type { VectorFilter } from "@mastra/core/vector/filter";
import { QdrantClient, QdrantClientParams } from "@qdrant/js-client-rest";
import type { Schemas } from "@qdrant/js-client-rest";
import { QdrantFilterTranslator } from "./qdrantFilter";

const BATCH_SIZE = 256;
const DISTANCE_MAPPING: Record<string, Schemas["Distance"]> = {
  cosine: "Cosine",
  euclidean: "Euclid",
  dotproduct: "Dot",
};

// Extend QueryVectorParams to include sparse vector
export interface QueryVectorParamsWithSparse extends QueryVectorParams {
  querySparseVector?: {
    name: string;
    indices: number[];
    values: number[];
  };
}


export class QdrantVector extends MastraVector {
  private client: QdrantClient;

  constructor({
    url,
    host,
    apiKey,
    https,
    prefix,
    port = 6333,
    timeout = 300_000,
    checkCompatibility = true,
    ...args
  }: QdrantClientParams = {}) {
    super();
    const baseClient = new QdrantClient({
      host,
      port,
      apiKey,
      https,
    });

    const telemetry = this.__getTelemetry();
    this.client =
      telemetry?.traceClass(baseClient, {
        spanNamePrefix: "qdrant-vector",
        attributes: {
          "vector.type": "qdrant",
        },
      }) ?? baseClient;
  }

  async upsert(...args: ParamsToArgs<UpsertVectorParams>): Promise<string[]> {
    const params = this.normalizeArgs<UpsertVectorParams>("upsert", args);

    const { indexName, vectors, metadata, ids } = params;

    const pointIds = ids || vectors.map(() => crypto.randomUUID());

    const records = vectors.map((vector, i) => ({
      id: pointIds[i],
      vector: vector,
      payload: metadata?.[i] || {},
    }));

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await this.client.upsert(indexName, {
        points: batch,
        wait: true,
      });
    }

    return pointIds;
  }

  async createIndex(...args: ParamsToArgs<CreateIndexParams>): Promise<void> {
    const params = this.normalizeArgs<CreateIndexParams>("createIndex", args);

    const { indexName, dimension, metric = "cosine" } = params;

    if (!Number.isInteger(dimension) || dimension <= 0) {
      throw new Error("Dimension must be a positive integer");
    }
    await this.client.createCollection(indexName, {
      vectors: {
        size: dimension,
        distance: DISTANCE_MAPPING[metric],
      },
      // Assuming sparse vector configuration is handled by the embedder project
      // or a separate setup script. If ragger needs to ensure this, add:
      // sparse_vectors: {
      //   'keyword_sparse': { // Must match the name used in embedder
      //     index: {
      //       type: 'sparse_hnsw',
      //       m: 16,
      //       ef_construct: 100,
      //     }
      //   }
      // }
    });
  }

  transformFilter(filter?: VectorFilter) {
    const translator = new QdrantFilterTranslator();
    return translator.translate(filter);
  }

  async query(
    ...args: ParamsToArgs<QueryVectorParamsWithSparse> // Use extended params
  ): Promise<QueryResult[]> {
    const params = this.normalizeArgs<QueryVectorParamsWithSparse>("query", args);

    const {
      indexName,
      queryVector,
      querySparseVector, // Destructure sparse vector
      topK = 10,
      filter,
      includeVector = false,
    } = params;

    const translatedFilter = this.transformFilter(filter) ?? {};

    // Use client.query for hybrid queries
    let queryRequest: Schemas["QueryRequest"] = {
        limit: topK,
        filter: translatedFilter,
        with_payload: true,
        with_vector: includeVector,
    };

    if (querySparseVector && querySparseVector.indices.length > 0) {
        console.log(`Performing hybrid search with sparse vector: ${querySparseVector.name}`);
        queryRequest.query = { // Construct the query object for hybrid search
            fusion: "rrf", // Use Reciprocal Rank Fusion for hybrid
            queries: [
                { vector: queryVector }, // Dense query part
                { sparse: { indices: querySparseVector.indices, values: querySparseVector.values }, name: querySparseVector.name } // Sparse query part
            ]
        };
    } else if (queryVector) {
        console.log("Performing dense-only search.");
        queryRequest.query = queryVector; // For dense-only search, query is the vector itself
    } else {
         throw new Error("Either queryVector or querySparseVector must be provided.");
    }

    // client.query returns { points: ScoredPoint[], ... }
    const response = await this.client.query(indexName, queryRequest);
    const results = response.points; // Extract results from the 'points' property

    return results.map((match) => {
      let vector: number[] = [];
      if (includeVector) {
        // Qdrant's ScoredPoint vector can be an object (named vectors) or array (default vector)
        if (Array.isArray(match.vector)) {
          vector = match.vector as number[];
        } else if (typeof match.vector === 'object' && match.vector !== null) {
          // If it's a named vector response, and we expect the default unnamed one
          // This part might need adjustment based on how Qdrant returns the default dense vector
          // when named sparse vectors are also present. Assuming it's still `match.vector` for the dense part.
          // If 'vector' field is an object like { default: [...] }, then use match.vector.default
          // For now, assuming match.vector is the dense vector if not an array.
          // This might need refinement if Qdrant's response structure for hybrid search is more complex.
          // A common pattern is that `vector` field holds the dense vector used in the `vector` param of SearchRequest.
          const denseVectorData = (match.vector as Schemas["Vector"])?.valueOf(); // Attempt to get primitive if it's a Vector object
          if (Array.isArray(denseVectorData)) {
            vector = denseVectorData;
          }
        }
      }

      return {
        id: match.id as string, // ID can be string or number, cast to string for QueryResult
        score: match.score || 0,
        metadata: match.payload as Record<string, any>,
        ...(includeVector && { vector }),
      };
    });
  }

  async listIndexes(): Promise<string[]> {
    const response = await this.client.getCollections();
    return response.collections.map((collection) => collection.name) || [];
  }

  async describeIndex(indexName: string): Promise<IndexStats> {
    const { config, points_count } = await this.client.getCollection(indexName);

    const distance = config.params.vectors?.distance as Schemas["Distance"];
    return {
      dimension: config.params.vectors?.size as number,
      count: points_count || 0,
      // @ts-expect-error
      metric: Object.keys(DISTANCE_MAPPING).find(
        (key) => DISTANCE_MAPPING[key] === distance
      ),
    };
  }

  async deleteIndex(indexName: string): Promise<void> {
    await this.client.deleteCollection(indexName);
  }

  async updateIndexById(
    indexName: string,
    id: string,
    update: {
      vector?: number[];
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    if (!update.vector && !update.metadata) {
      throw new Error("No updates provided");
    }

    const pointId = this.parsePointId(id);

    try {
      // Handle metadata-only update
      if (update.metadata && !update.vector) {
        // For metadata-only updates, use the setPayload method
        await this.client.setPayload(indexName, {
          payload: update.metadata,
          points: [pointId],
        });
        return;
      }

      // Handle vector-only update
      if (update.vector && !update.metadata) {
        await this.client.updateVectors(indexName, {
          points: [
            {
              id: pointId,
              vector: update.vector,
            },
          ],
        });
        return;
      }

      // Handle both vector and metadata update
      if (update.vector && update.metadata) {
        const point = {
          id: pointId,
          vector: update.vector,
          payload: update.metadata,
        };

        await this.client.upsert(indexName, {
          points: [point],
        });
        return;
      }
    } catch (error) {
      console.error("Error updating point in Qdrant:", error);
      throw error;
    }
  }

  async deleteIndexById(indexName: string, id: string): Promise<void> {
    // Parse the ID - Qdrant supports both string and numeric IDs
    const pointId = this.parsePointId(id);

    // Use the Qdrant client to delete the point from the collection
    await this.client.delete(indexName, {
      points: [pointId],
    });
  }

  /**
   * Parses and converts a string ID to the appropriate type (string or number) for Qdrant point operations.
   *
   * Qdrant supports both numeric and string IDs. This helper method ensures IDs are in the correct format
   * before sending them to the Qdrant client API.
   *
   * @param id - The ID string to parse
   * @returns The parsed ID as either a number (if string contains only digits) or the original string
   *
   * @example
   * // Numeric ID strings are converted to numbers
   * parsePointId("123") => 123
   * parsePointId("42") => 42
   * parsePointId("0") => 0
   *
   * // String IDs containing any non-digit characters remain as strings
   * parsePointId("doc-123") => "doc-123"
   * parsePointId("user_42") => "user_42"
   * parsePointId("abc123") => "abc123"
   * parsePointId("123abc") => "123abc"
   * parsePointId("") => ""
   * parsePointId("uuid-5678-xyz") => "uuid-5678-xyz"
   *
   * @remarks
   * - This conversion is important because Qdrant treats numeric and string IDs differently
   * - Only positive integers are converted to numbers (negative numbers with minus signs remain strings)
   * - The method uses base-10 parsing, so leading zeros will be dropped in numeric conversions
   * - reference: https://qdrant.tech/documentation/concepts/points/?q=qdrant+point+id#point-ids
   */
  private parsePointId(id: string): string | number {
    // Try to parse as number if it looks like one
    if (/^\d+$/.test(id)) {
      return parseInt(id, 10);
    }
    return id;
  }
}
