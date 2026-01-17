"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { HumanMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";

// --- Model Configuration ---
const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.7,
    maxOutputTokens: 8192,
});

// --- Constants ---
const MIN_SUBTOPICS = 3;
const MAX_SUBTOPICS = 5;
const QUESTIONS_PER_SUBTOPIC = 10;
const MAX_RETRIES = 2;
const RECURSION_LIMIT = 25;

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

const SubtopicsArraySchema = z.array(z.string().min(1)).min(MIN_SUBTOPICS).max(MAX_SUBTOPICS);
const QuestionsArraySchema = z.array(QuizQuestionSchema);

// Structured output schemas for LLM responses
const SubtopicsResponseSchema = z.object({
    subtopics: SubtopicsArraySchema,
});

const QuestionsResponseSchema = z.object({
    questions: QuestionsArraySchema,
});


// State definition using Annotation for type safety
const AgentStateAnnotation = Annotation.Root({
    userQuery: Annotation<string>({
        reducer: (x, y) => y ?? x ?? "",
        default: () => "",
    }),
    documents: Annotation<Document[]>({
        reducer: (x, y) => y ?? x ?? [],
        default: () => [],
    }),
    messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => (x ?? []).concat(y ?? []),
        default: () => [],
    }),
    topic: Annotation<string>({
        reducer: (x, y) => y ?? x ?? "",
        default: () => "",
    }),
    subtopics: Annotation<string[]>({
        reducer: (x, y) => y ?? x ?? [],
        default: () => [],
    }),
    questions: Annotation<QuizQuestion[]>({
        reducer: (x, y) => (x ?? []).concat(y ?? []),
        default: () => [],
    }),
    next: Annotation<string>({
        reducer: (x, y) => y ?? x ?? END,
        default: () => END,
    }),

});

type AgentState = typeof AgentStateAnnotation.State;

// --- Nodes ---

// Supervisor Node - Orchestrates workflow with deterministic logic
const supervisorSchema = z.object({
    next: z.enum(["TopicGenerator", "QuestionGenerator", "FINISH"]),
    reasoning: z.string().optional(),
});

const supervisorPrompt = `You are a supervisor orchestrating a multi-agent test generation workflow.

Team Members:
1. "TopicGenerator": Generates ${MIN_SUBTOPICS}-${MAX_SUBTOPICS} related subtopics for the main topic
2. "QuestionGenerator": Generates ${QUESTIONS_PER_SUBTOPIC} questions per subtopic

Decision Logic:
- If subtopics array is empty → route to "TopicGenerator"
- If subtopics exist but questions array is empty → route to "QuestionGenerator"
- If questions have been generated → respond with "FINISH"

Provide your decision with brief reasoning for observability.`;


async function supervisorNode(state: AgentState): Promise<Partial<AgentState>> {
    
    // Deterministic decision logic with safety checks
    const hasSubtopics = state.subtopics.length > 0;
    const hasQuestions = state.questions.length > 0;
   
    const context = `
Current Workflow State:
- Subtopics: ${state.subtopics.length} generated
- Questions: ${state.questions.length} generated
`;

    const structuredModel = model.withStructuredOutput(supervisorSchema);

    try {
        const response = await structuredModel.invoke([
            new SystemMessage(supervisorPrompt + context),
            ...state.messages.slice(-5), // Keep context window manageable
        ]);
        
        
        return {
            next: response.next,
            messages: [new SystemMessage(`Supervisor: ${response.reasoning || response.next}`)],
        };
    } catch (error) {
        return {
            next: "FINISH",
        
        };
    }
}