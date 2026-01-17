"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { api, internal } from "./_generated/api";
import { HumanMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";

// --- Model Configuration ---
const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.7,
    maxOutputTokens: 8192,
});

// Constants
const MIN_SUBTOPICS = 3;
const MAX_SUBTOPICS = 5;
const MIN_QUESTIONS_PER_SUBTOPIC = 5;
const MAX_QUESTIONS_PER_SUBTOPIC = 10;

// Type for document search results
type DocumentResult = {
    _id: string;
    _score: number;
};

// Zod schemas for runtime validation
const QuizQuestionSchema = z.object({
    question: z.string().min(10, "Question must be at least 10 characters"),
    options: z.object({
        A: z.string().min(1),
        B: z.string().min(1),
        C: z.string().min(1),
        D: z.string().min(1),
    }),
    correctAnswer: z.enum(["A", "B", "C", "D"]),
    explanation: z.string().min(10, "Explanation must be at least 10 characters"),
    subtopic: z.string().optional(),
});

type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

// Zod schema for subtopics validation
const SubtopicsResponseSchema = z.object({
    subtopics: z.array(z.string().min(1)).min(MIN_SUBTOPICS).max(MAX_SUBTOPICS),
});

// Full quiz schema for structured output
const FullQuizResponseSchema = z.object({
    questions: z.array(QuizQuestionSchema).min(MIN_QUESTIONS_PER_SUBTOPIC).max(MAX_QUESTIONS_PER_SUBTOPIC),
});

// State definition using Annotation for type safety
const AgentStateAnnotation = Annotation.Root({
    userQuery: Annotation<string>({
        reducer: (x, y) => y ?? x ?? "",
        default: () => "",
    }),
    enhancedQuery: Annotation<string>({
        reducer: (x, y) => y ?? x ?? "",
        default: () => "",
    }),
    documents: Annotation<DocumentResult[]>({
        reducer: (x, y) => y ?? x ?? [],
        default: () => [],
    }),
    fullDocs: Annotation<any[]>({
        reducer: (x, y) => y ?? x ?? [],
        default: () => [],
    }),
    subtopics: Annotation<string[]>({
        reducer: (x, y) => y ?? x ?? [],
        default: () => [],
    }),
    questions: Annotation<QuizQuestion[]>({
        reducer: (x, y) => (x ?? []).concat(y ?? []),
        default: () => [],
    }),
});

type AgentState = typeof AgentStateAnnotation.State;


// Node: Enhance the user query for better search results
async function enhanceQuery(state: AgentState): Promise<Partial<AgentState>> {
    const { userQuery } = state;
    
    console.log(`🔧 Enhancing query: "${userQuery}"`);
    
    const enhancementPrompt = `You are a query enhancement specialist. Your task is to improve search queries for better vector search results.

Given the user's query, enhance it by:
1. Expanding abbreviations and acronyms
2. Adding relevant synonyms and related terms
3. Making it more specific and descriptive
4. Keeping the core intent intact

Original query: "${userQuery}"

Provide ONLY the enhanced query text, nothing else.`;

    const response = await model.invoke([
        new HumanMessage(enhancementPrompt),
    ]);
    
    const enhancedQuery = response.content.toString().trim();
    
    console.log(`✅ Enhanced query: "${enhancedQuery}"`);
    
    return {
        enhancedQuery,
    };
}

// Node: Retrieve documents using vector search
async function retrieveDocuments(state: AgentState, config: any): Promise<Partial<AgentState>> {
    const { enhancedQuery } = state;
    const { convexClient } = config.configurable;
    
    console.log(`🔍 Retrieving documents for enhanced query: "${enhancedQuery}"`);
    
    const searchResults = await convexClient.runAction(api.documents.vectorSearch, {
        query: enhancedQuery,
        limit: 5,
    });
    
    console.log(`✅ Found ${searchResults.length} documents`);
    
    // Fetch full document content
    const fullDocs = await convexClient.runQuery(internal.documents.fetchResults, {
        ids: searchResults.map((doc: DocumentResult) => doc._id),
    });
    
    console.log(`📄 Fetched ${fullDocs.length} full documents`);
    
    return {
        documents: searchResults,
        fullDocs,
    };
}

// Node: Generate subtopics based on retrieved documents
async function generateSubtopics(state: AgentState): Promise<Partial<AgentState>> {
    const { fullDocs, userQuery } = state;
    
    console.log(`📋 Generating subtopics from ${fullDocs.length} documents`);
    
    if (fullDocs.length === 0) {
        console.log("⚠️ No documents found, cannot generate subtopics");
        return { subtopics: [] };
    }
    
    // Build context from documents
    const documentContext = fullDocs
        .map((doc: any, i: number) => `[Document ${i + 1}]\n${doc.text}`)
        .join("\n\n");
    
    const prompt = `Based on the following documents related to the query "${userQuery}", generate ${MIN_SUBTOPICS} to ${MAX_SUBTOPICS} distinct subtopics that can be used to create test questions.

Requirements:
- Each subtopic should be specific and focused on different aspects covered in the documents
- Subtopics should be suitable for generating quiz questions
- Cover diverse areas from the document content
- Make subtopics clear and concise

Documents:
${documentContext}

Generate the subtopics as a JSON object with a "subtopics" array.`;

    const structuredModel = model.withStructuredOutput(SubtopicsResponseSchema);
    
    try {
        const response = await structuredModel.invoke([
            new HumanMessage(prompt),
        ]);
        
        console.log(`✅ Generated ${response.subtopics.length} subtopics:`, response.subtopics);
        
        return {
            subtopics: response.subtopics,
        };
    } catch (error) {
        console.error("Error generating subtopics:", error);
        return { subtopics: [] };
    }
}

// Node: Generate questions for each subtopic based on documents
async function generateQuestions(state: AgentState): Promise<Partial<AgentState>> {
    const { subtopics, fullDocs } = state;
    
    console.log(`❓ Generating questions for ${subtopics.length} subtopics`);
    
    if (subtopics.length === 0 || fullDocs.length === 0) {
        console.log("⚠️ No subtopics or documents found, cannot generate questions");
        return { questions: [] };
    }
    
    // Build context from documents
    const documentContext = fullDocs
        .map((doc: any, i: number) => `[Document ${i + 1}]\n${doc.text}`)
        .join("\n\n");
    
    const allQuestions: QuizQuestion[] = [];
    
    // Generate questions for each subtopic
    for (let i = 0; i < subtopics.length; i++) {
        const subtopic = subtopics[i];
        console.log(`📝 Generating questions for subtopic ${i + 1}/${subtopics.length}: "${subtopic}"`);
        
        const prompt = `You are an expert quiz question generator. Generate ${MIN_QUESTIONS_PER_SUBTOPIC} to ${MAX_QUESTIONS_PER_SUBTOPIC} multiple-choice questions for the following subtopic based on the provided documents.

Subtopic: "${subtopic}"

Requirements:
- Each question must be clear, specific, and based on information in the documents
- Provide 4 options (A, B, C, D) with only one correct answer
- Include a detailed explanation for the correct answer
- Questions should test understanding, not just memorization
- Vary difficulty levels across questions
- Ensure all information is grounded in the provided documents

Documents:
${documentContext}

Generate the questions as a JSON object with a "questions" array.`;

        const structuredModel = model.withStructuredOutput(FullQuizResponseSchema);
        
        try {
            const response = await structuredModel.invoke([
                new HumanMessage(prompt),
            ]);
            
            // Add subtopic to each question
            const questionsWithSubtopic = response.questions.map(q => ({
                ...q,
                subtopic,
            }));
            
            allQuestions.push(...questionsWithSubtopic);
            console.log(`✅ Generated ${response.questions.length} questions for "${subtopic}"`);
        } catch (error) {
            console.error(`Error generating questions for subtopic "${subtopic}":`, error);
        }
    }
    
    console.log(`✅ Total questions generated: ${allQuestions.length}`);
    
    return {
        questions: allQuestions,
    };
}

// Build the agent graph
function buildGraph() {
    const workflow = new StateGraph(AgentStateAnnotation)
        .addNode("enhance", enhanceQuery)
        .addNode("retrieve", retrieveDocuments)
        .addNode("generateSubtopics", generateSubtopics)
        .addNode("generateQuestions", generateQuestions)
        .addEdge(START, "enhance")
        .addEdge("enhance", "retrieve")
        .addEdge("retrieve", "generateSubtopics")
        .addEdge("generateSubtopics", "generateQuestions")
        .addEdge("generateQuestions", END);
    
    return workflow.compile();
}

// Export the action
export const runDocumentRetrieval = action({
    args: {
        query: v.string(),
    },
    handler: async (ctx, args) => {
        const graph = buildGraph();
        
        const result = await graph.invoke(
            { userQuery: args.query },
            { configurable: { convexClient: ctx } }
        );
        
        return {
            success: true,
            originalQuery: result.userQuery,
            enhancedQuery: result.enhancedQuery,
            documentsFound: result.documents.length,
            documents: result.documents,
            subtopics: result.subtopics,
            questions: result.questions,
            totalQuestions: result.questions.length,
        };
    },
});