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

import { BaseFilterTranslator } from "@mastra/core/vector/filter";
import type {
  FieldCondition,
  VectorFilter,
  LogicalOperator,
  OperatorSupport,
} from "@mastra/core/vector/filter";

/**
 * Translates MongoDB-style filters to Qdrant compatible filters.
 *
 * Key transformations:
 * - $and -> must
 * - $or -> should
 * - $not -> must_not
 * - { field: { $op: value } } -> { key: field, match/range: { value/gt/lt: value } }
 *
 * Custom operators (Qdrant-specific):
 * - $count -> values_count (array length/value count)
 * - $geo -> geo filters (box, radius, polygon)
 * - $hasId -> has_id filter
 * - $nested -> nested object filters
 * - $hasVector -> vector existence check
 * - $datetime -> RFC 3339 datetime range
 * - $null -> is_null check
 * - $empty -> is_empty check
 */
export class QdrantFilterTranslator extends BaseFilterTranslator {
  // Add regex sanitization method - less aggressive
  private sanitizeRegex(pattern: string): string {
    // Escape characters that have special meaning in regex, but allow common ones like .*^$+?()[]{}|
    // This is a more permissive sanitization based on common regex usage.
    return pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  }

  protected override isLogicalOperator(key: string): key is LogicalOperator {
    return (
      super.isLogicalOperator(key) || key === "$hasId" || key === "$hasVector"
    );
  }

  protected override getSupportedOperators(): OperatorSupport {
    return {
      ...BaseFilterTranslator.DEFAULT_OPERATORS,
      logical: ["$and", "$or", "$not"],
      array: ["$in", "$nin"],
      regex: ["$regex"],
      custom: [
        "$count",
        "$geo",
        "$nested",
        "$datetime",
        "$null",
        "$empty",
        "$hasId",
        "$hasVector",
      ],
    };
  }

  translate(filter?: VectorFilter): VectorFilter {
    if (this.isEmpty(filter)) return filter;
    this.validateFilter(filter);
    return this.translateNode(filter);
  }

  private createCondition(type: string, value: any, fieldKey?: string) {
    const condition = { [type]: value };
    return fieldKey ? { key: fieldKey, ...condition } : condition;
  }

  private translateNode(
    node: VectorFilter | FieldCondition,
    isNested: boolean = false,
    fieldKey?: string
  ): any {
    if (!this.isEmpty(node) && typeof node === "object" && "must" in node) {
      return node;
    }

    if (this.isPrimitive(node)) {
      if (node === null) {
        return { is_null: { key: fieldKey } };
      }
      return this.createCondition(
        "match",
        { value: this.normalizeComparisonValue(node) },
        fieldKey
      );
    }

    if (this.isRegex(node)) {
      throw new Error("Direct regex pattern format is not supported in Qdrant");
    }

    if (Array.isArray(node)) {
      return node.length === 0
        ? { is_empty: { key: fieldKey } }
        : this.createCondition(
            "match",
            { any: this.normalizeArrayValues(node) },
            fieldKey
          );
    }

    const entries = Object.entries(node as Record<string, any>);

    // Handle logical operators first
    const logicalResult = this.handleLogicalOperators(entries, isNested);
    if (logicalResult) {
      return logicalResult;
    }

    // Handle field conditions
    const { conditions, range, matchCondition } = this.handleFieldConditions(
      entries,
      fieldKey
    );

    if (Object.keys(range).length > 0) {
      conditions.push({ key: fieldKey, range });
    }

    if (matchCondition) {
      conditions.push({ key: fieldKey, match: matchCondition });
    }

    return this.buildFinalConditions(conditions, isNested);
  }

  private buildFinalConditions(conditions: any[], isNested: boolean): any {
    if (conditions.length === 0) {
      return {};
    } else if (conditions.length === 1 && isNested) {
      return conditions[0];
    } else {
      return { must: conditions };
    }
  }

  private handleLogicalOperators(
    entries: [string, any][],
    isNested: boolean
  ): any | null {
    const firstKey = entries[0]?.[0];

    if (
      firstKey &&
      this.isLogicalOperator(firstKey) &&
      !this.isCustomOperator(firstKey)
    ) {
      const [key, value] = entries[0]!;
      const qdrantOp = this.getQdrantLogicalOp(key);
      return {
        [qdrantOp]: Array.isArray(value)
          ? value.map((v) => this.translateNode(v, true))
          : [this.translateNode(value, true)],
      };
    }

    if (
      entries.length > 1 &&
      !isNested &&
      entries.every(
        ([key]) => !this.isOperator(key) && !this.isCustomOperator(key)
      )
    ) {
      return {
        must: entries.map(([key, value]) =>
          this.translateNode(value, true, key)
        ),
      };
    }

    return null;
  }

  private handleFieldConditions(
    entries: [string, any][],
    fieldKey?: string
  ): {
    conditions: any[];
    range: Record<string, any>;
    matchCondition: Record<string, any> | null;
  } {
    const conditions = [];
    let range: Record<string, any> = {};
    let matchCondition: Record<string, any> | null = null;

    for (const [key, value] of entries) {
      if (this.isCustomOperator(key)) {
        const customOp = this.translateCustomOperator(key, value, fieldKey);
        conditions.push(customOp);
      } else if (this.isOperator(key)) {
        // Pass the fieldKey to translateOperatorValue for operators that need it
        const opResult = this.translateOperatorValue(key, value, fieldKey);
        if (opResult?.range) { // Check if opResult is not null/undefined before accessing range
          Object.assign(range, opResult.range);
        } else {
          matchCondition = opResult;
        }
      } else {
        const nestedKey = fieldKey ? `${fieldKey}.${key}` : key;
        const nestedCondition = this.translateNode(value, true, nestedKey);

        if (nestedCondition.must) {
          conditions.push(...nestedCondition.must);
        } else if (!this.isEmpty(nestedCondition)) {
          conditions.push(nestedCondition);
        }
      }
    }

    return { conditions, range, matchCondition };
  }

  private translateCustomOperator(
    op: string,
    value: any,
    fieldKey?: string
  ): any {
    switch (op) {
      case "$count":
        const countConditions = Object.entries(value).reduce(
          (acc, [k, v]) => ({
            ...acc,
            [k.replace("$", "")]: v,
          }),
          {}
        );
        return { key: fieldKey, values_count: countConditions };
      case "$geo":
        const geoOp = this.translateGeoFilter(value.type, value);
        return { key: fieldKey, ...geoOp };
      case "$hasId":
        return { has_id: Array.isArray(value) ? value : [value] };
      case "$nested":
        return {
          nested: {
            key: fieldKey,
            filter: this.translateNode(value),
          },
        };
      case "$hasVector":
        return { has_vector: value };
      case "$datetime":
        return {
          key: fieldKey,
          range: this.normalizeDatetimeRange(value.range),
        };
      case "$null":
        return { is_null: { key: fieldKey } };
      case "$empty":
        return { is_empty: { key: fieldKey } };
      default:
        throw new Error(`Unsupported custom operator: ${op}`);
    }
  }

  private getQdrantLogicalOp(op: string): string {
    switch (op) {
      case "$and":
        return "must";
      case "$or":
        return "should";
      case "$not":
        return "must_not";
      default:
        throw new Error(`Unsupported logical operator: ${op}`);
    }
  }

  private translateOperatorValue(operator: string, value: any, fieldKey?: string): any {
    // The 'exists' operator needs the fieldKey, others might not.
    // Handle 'exists' specifically here as it's a bit different from standard value comparisons.
    if (operator === "exists") {
        if (!fieldKey) {
            throw new Error(`'exists' operator requires a field key.`);
        }
        // "$exists": true -> field should exist (not null)
        // "$exists": false -> field should not exist (is null)
        return value
            ? { must_not: [{ is_null: { key: fieldKey } }] }
            : { is_null: { key: fieldKey } };
    }

    const normalizedValue = this.normalizeComparisonValue(value);

    switch (operator) {
      case "$eq":
        return { value: normalizedValue };
      case "$ne":
        return { except: [normalizedValue] };
      case "$gt":
        return { range: { gt: normalizedValue } };
      case "$gte":
        return { range: { gte: normalizedValue } };
      case "$lt":
        return { range: { lt: normalizedValue } };
      case "$lte":
        return { range: { lte: normalizedValue } };
      case "$in":
        return { any: this.normalizeArrayValues(value) };
      case "$nin":
        return { except: this.normalizeArrayValues(value) };
      case "$regex":
        // Sanitize the regex pattern and format for Qdrant text match
        const sanitizedPattern = this.sanitizeRegex(value);
        return {
          match: {
            text: sanitizedPattern,
            // allow_errors: false // Or true based on requirements - keeping as false for now
          },
        };
      default:
        // For other operators, return the match or range condition
        // Note: Range conditions are handled separately in handleFieldConditions
        // This method primarily translates value-based match conditions.
        // If we reach here with an operator that should be handled, it's an error in logic or unsupported.
        throw new Error(`Unsupported operator or incorrect handling: ${operator}`);
    }
  }

  private translateGeoFilter(type: string, value: any): any {
    switch (type) {
      case "box":
        return {
          geo_bounding_box: {
            top_left: value.top_left,
            bottom_right: value.bottom_right,
          },
        };
      case "radius":
        return {
          geo_radius: {
            centre: value.center,
            radius: value.radius,
          },
        };
      case "polygon":
        return {
          geo_polygon: {
            exterior: value.exterior,
            interiors: value.interiors,
          },
        };
      default:
        throw new Error(`Unsupported geo filter type: ${type}`);
    }
  }

  private normalizeDatetimeRange(value: any): any {
    const range: Record<string, string> = {};
    for (const [op, val] of Object.entries(value)) {
      if (val instanceof Date) {
        range[op] = val.toISOString();
      } else if (typeof val === "string") {
        // Assume string is already in proper format
        range[op] = val;
      }
    }
    return range;
  }
}
