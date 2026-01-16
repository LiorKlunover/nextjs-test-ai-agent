/**
 * System Prompts Module
 * 
 * This module contains all system prompts used in the RAG system.
 * Centralizing prompts makes them easier to maintain, version, and customize.
 * 
 * @module prompts
 */

/**
 * System prompt for RAG-based chat responses
 * 
 * This prompt instructs the AI to:
 * - Answer based on provided document context
 * - Acknowledge when context doesn't contain relevant information
 * - Be helpful and conversational
 * - Cite document sections when appropriate
 * 
 * @param context - The relevant document chunks to use as context
 * @param query - The user's question
 * @returns Formatted prompt string for the AI model
 */
export function buildRagChatPrompt(context: string, query: string): string {
  return `You are a helpful AI assistant. Answer the user's question based on the following context from their documents.

Context:
${context}

User Question: ${query}

Instructions:
- Provide a clear, concise answer based on the context
- If the context doesn't contain relevant information, say so
- Be helpful and conversational
- Cite which document sections you're referencing when relevant

Answer:`;
}
