import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTables,
  numbers: defineTable({
    value: v.number(),
  }),

  // define vector index for documents
  documents: defineTable({
    text: v.string(),
    embedding: v.array(v.float64()),
    metadata: v.object({
      source: v.string(),
      fileName: v.string(),
      uploadedAt: v.string(),
      chunkIndex: v.number(),
      totalChunks: v.number(),
    }),
  })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 768,
      filterFields: ["metadata.fileName"],
    })
    .index("by_fileName", ["metadata.fileName"])
    .index("by_source", ["metadata.source"]),
});
