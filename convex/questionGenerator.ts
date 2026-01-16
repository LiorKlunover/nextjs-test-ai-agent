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

// --- Types & Schemas ---

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

// Execution metadata for monitoring
interface ExecutionMetrics {
    startTime: number;
    nodeExecutions: Record<string, number>;
    errors: Array<{ node: string; error: string; timestamp: number }>;
    warnings: Array<{ node: string; message: string; timestamp: number }>;
}

// State definition using Annotation for type safety
const AgentStateAnnotation = Annotation.Root({
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
    metrics: Annotation<ExecutionMetrics>({
        reducer: (x, y) => y ?? x ?? {
            startTime: Date.now(),
            nodeExecutions: {},
            errors: [],
            warnings: [],
        },
        default: () => ({
            startTime: Date.now(),
            nodeExecutions: {},
            errors: [],
            warnings: [],
        }),
    }),
});

type AgentState = typeof AgentStateAnnotation.State;

// --- Helper Functions ---

// Logging utility with structured output
function logNodeExecution(nodeName: string, message: string, data?: unknown) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${nodeName}] ${message}`, data ? JSON.stringify(data, null, 2) : "");
}


// Error tracking utility
function trackError(state: AgentState, nodeName: string, error: unknown): Partial<AgentState> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logNodeExecution(nodeName, `ERROR: ${errorMessage}`);
    
    return {
        metrics: {
            ...state.metrics,
            errors: [
                ...state.metrics.errors,
                { node: nodeName, error: errorMessage, timestamp: Date.now() }
            ],
        },
    };
}

// Warning tracking utility
function trackWarning(state: AgentState, nodeName: string, message: string): Partial<AgentState> {
    logNodeExecution(nodeName, `WARNING: ${message}`);
    
    return {
        metrics: {
            ...state.metrics,
            warnings: [
                ...state.metrics.warnings,
                { node: nodeName, message, timestamp: Date.now() }
            ],
        },
    };
}

// Increment node execution counter
function incrementNodeExecution(state: AgentState, nodeName: string): ExecutionMetrics {
    return {
        ...state.metrics,
        nodeExecutions: {
            ...state.metrics.nodeExecutions,
            [nodeName]: (state.metrics.nodeExecutions[nodeName] || 0) + 1,
        },
    };
}

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
    const nodeName = "supervisor";
    logNodeExecution(nodeName, "Starting execution");

    const metrics = incrementNodeExecution(state, nodeName);
    
    // Deterministic decision logic with safety checks
    const hasSubtopics = state.subtopics.length > 0;
    const hasQuestions = state.questions.length > 0;
    const executionCount = metrics.nodeExecutions[nodeName] || 0;

    logNodeExecution(nodeName, "State check", {
        subtopics: state.subtopics.length,
        questions: state.questions.length,
        executionCount,
    });

    // Safety: Prevent infinite loops
    if (executionCount > RECURSION_LIMIT) {
        logNodeExecution(nodeName, "Recursion limit reached, forcing FINISH");
        return {
            next: "FINISH",
            metrics,
            ...trackWarning(state, nodeName, "Recursion limit reached"),
        };
    }

    // Deterministic routing logic
    if (hasQuestions) {
        logNodeExecution(nodeName, "Questions generated, workflow complete");
        return { next: "FINISH", metrics };
    }

    if (!hasSubtopics) {
        logNodeExecution(nodeName, "No subtopics found, routing to TopicGenerator");
        return { next: "TopicGenerator", metrics };
    }

    if (hasSubtopics && !hasQuestions) {
        logNodeExecution(nodeName, "Subtopics ready, routing to QuestionGenerator");
        return { next: "QuestionGenerator", metrics };
    }

    // Fallback with LLM decision for edge cases
    const context = `
Current Workflow State:
- Subtopics: ${state.subtopics.length} generated
- Questions: ${state.questions.length} generated
- Execution count: ${executionCount}
`;

    const structuredModel = model.withStructuredOutput(supervisorSchema);

    try {
        const response = await structuredModel.invoke([
            new SystemMessage(supervisorPrompt + context),
            ...state.messages.slice(-5), // Keep context window manageable
        ]);
        
        logNodeExecution(nodeName, "LLM decision", response);
        
        return {
            next: response.next,
            metrics,
            messages: [new SystemMessage(`Supervisor: ${response.reasoning || response.next}`)],
        };
    } catch (error) {
        logNodeExecution(nodeName, "LLM decision failed, using safe fallback");
        return {
            next: "FINISH",
            metrics,
            ...trackError(state, nodeName, error),
        };
    }
}

// Topic Generator Node - Generates subtopics with validation and retry logic
async function topicGeneratorNode(state: AgentState): Promise<Partial<AgentState>> {
    const nodeName = "TopicGenerator";
    logNodeExecution(nodeName, "Starting execution", { topic: state.topic });

    const metrics = incrementNodeExecution(state, nodeName);

    const prompt = `Generate exactly ${MIN_SUBTOPICS} to ${MAX_SUBTOPICS} related subtopics for the main topic: "${state.topic}".

Requirements:
- Each subtopic should be distinct and cover different aspects
- Subtopics should be specific enough to generate meaningful questions
- Cover a comprehensive range of the topic

Topic: ${state.topic}`;

    let subtopics: string[] = [];
    let lastError: Error | null = null;

    // Use structured output for reliable parsing
    const structuredModel = model.withStructuredOutput(SubtopicsResponseSchema);

    // Retry logic for robustness
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            logNodeExecution(nodeName, `Attempt ${attempt + 1}/${MAX_RETRIES}`);
            
            const response = await structuredModel.invoke([new HumanMessage(prompt)]);
            
            // Extract subtopics from structured response
            subtopics = response.subtopics;
            
            logNodeExecution(nodeName, "Successfully generated subtopics", { count: subtopics.length });
            
            return {
                subtopics,
                metrics,
                messages: [
                    new HumanMessage(
                        `TopicGenerator: Generated ${subtopics.length} subtopics: ${subtopics.join(", ")}`
                    ),
                ],
            };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            logNodeExecution(nodeName, `Attempt ${attempt + 1} failed: ${lastError.message}`);
            
            if (attempt < MAX_RETRIES - 1) {
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
    }

    // Fallback: Generate default subtopics
    logNodeExecution(nodeName, "All retries failed, using fallback subtopics");
    subtopics = [
        `${state.topic} - Fundamentals`,
        `${state.topic} - Advanced Concepts`,
        `${state.topic} - Practical Applications`,
    ];

    return {
        subtopics,
        metrics,
        ...trackError(state, nodeName, lastError || new Error("Unknown error")),
        messages: [
            new HumanMessage(
                `TopicGenerator: Used fallback subtopics due to errors: ${subtopics.join(", ")}`
            ),
        ],
    };
}

// Question Generator Node - Parallel processing with validation
async function questionGeneratorNode(state: AgentState): Promise<Partial<AgentState>> {
    const nodeName = "QuestionGenerator";
    logNodeExecution(nodeName, "Starting execution", {
        subtopics: state.subtopics.length,
    });

    const metrics = incrementNodeExecution(state, nodeName);
    const subtopics = state.subtopics;
    const allQuestions: QuizQuestion[] = [];
    const errors: string[] = [];

    // Parallel processing with individual error handling
    const generateQuestionsForSubtopic = async (subtopic: string): Promise<QuizQuestion[]> => {
        const prompt = `Generate exactly ${QUESTIONS_PER_SUBTOPIC} multiple-choice questions about: "${subtopic}"
Main topic context: ${state.topic}

Requirements:
- Each question must have 4 options (A, B, C, D)
- Exactly one correct answer
- Clear, detailed explanation for the correct answer
- Questions should test understanding, not just memorization
- Questions should be challenging but fair`;

        const structuredModel = model.withStructuredOutput(QuestionsResponseSchema);

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                logNodeExecution(nodeName, `Generating questions for "${subtopic}" (attempt ${attempt + 1})`);
                
                const response = await structuredModel.invoke([new HumanMessage(prompt)]);
                
                // Extract questions from structured response
                const questions = response.questions;
                
                // Add subtopic to each question
                const questionsWithSubtopic = questions.map(q => ({
                    ...q,
                    subtopic,
                }));

                logNodeExecution(nodeName, `Successfully generated ${questionsWithSubtopic.length} questions for "${subtopic}"`);
                
                return questionsWithSubtopic;
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logNodeExecution(nodeName, `Attempt ${attempt + 1} failed for "${subtopic}": ${errorMsg}`);
                
                if (attempt < MAX_RETRIES - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                }
            }
        }

        errors.push(`Failed to generate questions for subtopic: ${subtopic}`);
        return [];
    };

    // Execute in parallel for performance
    logNodeExecution(nodeName, "Starting parallel question generation");
    const startTime = Date.now();
    
    //loop through subtopics and generate questions for each subtopic
    const results = await Promise.all(
        subtopics.map(subtopic => generateQuestionsForSubtopic(subtopic))
    );
    
    const duration = Date.now() - startTime;
    results.forEach(questions => allQuestions.push(...questions));

    logNodeExecution(nodeName, "Parallel execution completed", {
        totalQuestions: allQuestions.length,
        expectedQuestions: subtopics.length * QUESTIONS_PER_SUBTOPIC,
        duration: `${duration}ms`,
        errors: errors.length,
    });

    // Track warnings if we didn't get all expected questions
    const expectedTotal = subtopics.length * QUESTIONS_PER_SUBTOPIC;
    const warningUpdate = allQuestions.length < expectedTotal
        ? trackWarning(
            state,
            nodeName,
            `Generated ${allQuestions.length}/${expectedTotal} expected questions`
        )
        : {};

    return {
        questions: allQuestions,
        metrics,
        ...warningUpdate,
        messages: [
            new HumanMessage(
                `QuestionGenerator: Generated ${allQuestions.length} questions across ${subtopics.length} subtopics${errors.length > 0 ? ` (${errors.length} errors)` : ""}`
            ),
        ],
    };
}


// --- Graph Construction ---

function createTestGeneratorGraph() {
    logNodeExecution("GraphBuilder", "Creating workflow graph");
    
    const workflow = new StateGraph(AgentStateAnnotation)
        // Add nodes
        .addNode("supervisor", supervisorNode)
        .addNode("TopicGenerator", topicGeneratorNode)
        .addNode("QuestionGenerator", questionGeneratorNode)

        // Entry point
        .addEdge(START, "supervisor")

        // Worker nodes return to supervisor for orchestration
        .addEdge("TopicGenerator", "supervisor")
        .addEdge("QuestionGenerator", "supervisor")

        // Conditional routing from supervisor
        .addConditionalEdges(
            "supervisor",
            (state: AgentState) => state.next,
            {
                TopicGenerator: "TopicGenerator",
                QuestionGenerator: "QuestionGenerator",
                FINISH: END,
            }
        );

    logNodeExecution("GraphBuilder", "Compiling workflow graph");
    return workflow.compile();
}

// --- Convex Action ---

export const generateQuizQuestions = action({
    args: {
        topic: v.string(),
    },
    handler: async (ctx, args) => {
        const { topic } = args;
        const executionStart = Date.now();

        logNodeExecution("ConvexAction", "Starting quiz generation", { topic });

        // Input validation
        if (!topic || topic.trim().length === 0) {
            throw new Error("Topic must be a non-empty string");
        }

        if (topic.length > 200) {
            throw new Error("Topic must be less than 200 characters");
        }

        const app = createTestGeneratorGraph();

        const initialState: AgentState = {
            messages: [new HumanMessage(`Create a comprehensive test about: ${topic}`)],
            topic: topic.trim(),
            subtopics: [],
            questions: [],
            next: END,
            metrics: {
                startTime: Date.now(),
                nodeExecutions: {},
                errors: [],
                warnings: [],
            },
        };

        let result: AgentState;
        try {
            logNodeExecution("ConvexAction", "Invoking workflow graph");
            
            // Execute with recursion limit
            result = await app.invoke(initialState, {
                recursionLimit: RECURSION_LIMIT,
            }) as AgentState;
            
            const executionTime = Date.now() - executionStart;
            logNodeExecution("ConvexAction", "Workflow completed successfully", {
                executionTime: `${executionTime}ms`,
                subtopics: result.subtopics.length,
                questions: result.questions.length,
            });
        } catch (error) {
            const executionTime = Date.now() - executionStart;
            logNodeExecution("ConvexAction", "Workflow execution failed", {
                executionTime: `${executionTime}ms`,
                error: error instanceof Error ? error.message : String(error),
            });
            
            throw new Error(
                `Quiz generation failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }

        // Validate output
        const hasSubtopics = result.subtopics && result.subtopics.length > 0;
        const hasQuestions = result.questions && result.questions.length > 0;

        if (!hasSubtopics || !hasQuestions) {
            logNodeExecution("ConvexAction", "WARNING: Incomplete results", {
                hasSubtopics,
                hasQuestions,
            });
        }

        const executionTime = Date.now() - executionStart;

        return {
            success: hasSubtopics && hasQuestions,
            topic,
            subtopics: result.subtopics || [],
            questions: result.questions || [],
            total: (result.questions || []).length,
            metrics: {
                executionTimeMs: executionTime,
                nodeExecutions: result.metrics.nodeExecutions,
                errorCount: result.metrics.errors.length,
                warningCount: result.metrics.warnings.length,
                errors: result.metrics.errors,
                warnings: result.metrics.warnings,
            },
            debug_messages: (result.messages || []).map((m: BaseMessage) => m.content),
        };
    },
});
