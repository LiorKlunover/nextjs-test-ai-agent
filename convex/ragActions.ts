import { v } from "convex/values";
import { action } from "./_generated/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { api } from "./_generated/api";

// Helper function to generate embeddings using Google AI SDK directly
async function generateEmbedding(text: string): Promise<number[]> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  
  const result = await model.embedContent(text);
  return result.embedding.values;
}

// Simple text splitter that works in Convex runtime
function splitText(text: string, chunkSize: number = 1000, chunkOverlap: number = 200): string[] {
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    let chunk = text.substring(startIndex, endIndex);

    // Try to break at sentence boundaries if not at the end
    if (endIndex < text.length) {
      const lastPeriod = chunk.lastIndexOf('. ');
      const lastNewline = chunk.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);
      
      if (breakPoint > chunkSize / 2) {
        chunk = chunk.substring(0, breakPoint + 1);
        startIndex += breakPoint + 1;
      } else {
        startIndex += chunkSize - chunkOverlap;
      }
    } else {
      startIndex = text.length;
    }

    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }
  }

  return chunks;
}

export const embedDocument = action({
  args: {
    fileName: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    chunksCreated?: number;
    fileName?: string;
    error?: string;
  }> => {
    try {
      console.log(`📄 Processing document: ${args.fileName}`);
      
      const chunks: string[] = splitText(args.content, 1000, 200);
      console.log(`✂️  Split into ${chunks.length} chunks`);
      
      const totalChunks: number = chunks.length;
      const uploadedAt: string = new Date().toISOString();
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk: string = chunks[i];
        
        console.log(`🔢 Embedding chunk ${i + 1}/${totalChunks}...`);
        const embeddingResult: number[] = await generateEmbedding(chunk);
        
        await ctx.runMutation(api.documents.addDocument, {
          text: chunk,
          embedding: embeddingResult,
          metadata: {
            source: args.fileName,
            fileName: args.fileName,
            uploadedAt,
            chunkIndex: i,
            totalChunks,
          },
        });
      }
      
      console.log(`✅ Successfully embedded ${totalChunks} chunks`);
      
      return {
        success: true,
        chunksCreated: totalChunks,
        fileName: args.fileName,
      };
    } catch (error) {
      console.error("Error embedding document:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct: number = 0;
  let normA: number = 0;
  let normB: number = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const ragChat = action({
  args: {
    query: v.string(),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    answer: string;
    sources: Array<{
      fileName: string;
      chunkIndex: number;
      text: string;
      score: number;
    }>;
    error?: string;
  }> => {
    try {
      console.log(`🔍 Processing query: "${args.query}"`);
      
      const queryEmbedding: number[] = await generateEmbedding(args.query);
      console.log("✅ Query embedded");
      
      const allDocs = await ctx.runQuery(api.documents.getAllDocuments, {
        fileName: args.fileName,
      });
      
      if (allDocs.length === 0) {
        return {
          success: true,
          answer: "No documents found. Please upload some documents first.",
          sources: [],
        };
      }
      
      const docsWithScores = allDocs.map((doc) => ({
        ...doc,
        score: cosineSimilarity(queryEmbedding, doc.embedding),
      }));
      
      docsWithScores.sort((a, b) => b.score - a.score);
      
      const topDocs = docsWithScores.slice(0, 5);
      console.log(`📚 Found ${topDocs.length} relevant chunks`);
      
      const context: string = topDocs
        .map((doc, i) => `[${i + 1}] ${doc.text}`)
        .join("\n\n");
      
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      
      const prompt: string = `You are a helpful AI assistant. Answer the user's question based on the following context from their documents.

Context:
${context}

User Question: ${args.query}

Instructions:
- Provide a clear, concise answer based on the context
- If the context doesn't contain relevant information, say so
- Be helpful and conversational
- Cite which document sections you're referencing when relevant

Answer:`;
      
      console.log("💭 Generating answer with Gemini...");
      const result = await model.generateContent(prompt);
      const answer: string = result.response.text();
      
      console.log("✅ Answer generated");
      
      return {
        success: true,
        answer,
        sources: topDocs.map((doc) => ({
          fileName: doc.metadata.fileName,
          chunkIndex: doc.metadata.chunkIndex,
          text: doc.text.substring(0, 200) + "...",
          score: doc.score,
        })),
      };
    } catch (error) {
      console.error("Error in RAG chat:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        answer: "Sorry, I encountered an error processing your question.",
        sources: [],
      };
    }
  },
});

export const deleteDocument = action({
  args: {
    fileName: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    deleted?: number;
    error?: string;
  }> => {
    try {
      const result = await ctx.runMutation(api.documents.deleteByFileName, {
        fileName: args.fileName,
      });
      
      return {
        success: true,
        deleted: result.deleted,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
