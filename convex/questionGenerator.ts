"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { StateGraph, END, START } from "@langchain/langgraph";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

// Define the question structure
interface QuizQuestion {
    question: string;
    options: {
        A: string;
        B: string;
        C: string;
        D: string;
    };
    correctAnswer: "A" | "B" | "C" | "D";
    explanation: string;
}

// Define the workflow steps
type WorkflowStep = "start" | "generate" | "validate" | "regenerate" | "complete";

// Define the state interface
interface QuizState {
    messages: BaseMessage[];
    topic: string;
    questions: QuizQuestion[];
    currentStep: WorkflowStep;
    validationAttempts?: number;
    errors?: string[];
}

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-pro",
  temperature: 0.7,
  maxOutputTokens: 8192,
  topP: 0.95,
  topK: 40,
});


// Node: Generate questions using LLM
async function generateQuestions(state: QuizState): Promise<Partial<QuizState>> {
    const prompt = `Generate exactly 10 multiple-choice questions about the topic: "${state.topic}".

For each question, provide:
1. The question text
2. Four answer options (A, B, C, D)
3. The correct answer (A, B, C, or D)
4. A brief explanation of why the answer is correct

Format your response as a JSON array with this structure:
[
  {
    "question": "Question text here?",
    "options": {
      "A": "First option",
      "B": "Second option",
      "C": "Third option",
      "D": "Fourth option"
    },
    "correctAnswer": "A",
    "explanation": "Explanation here"
  }
]

Make sure the questions are educational, accurate, and cover different aspects of the topic.`;

    const response = await model.invoke([new HumanMessage(prompt)]);

    let questions: QuizQuestion[] = [];
    const errors: string[] = [];
    
    try {
        // Extract JSON from the response
        const content = response.content as string;
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            questions = JSON.parse(jsonMatch[0]) as QuizQuestion[];
        } else {
            errors.push("No JSON array found in response");
        }
    } catch (error) {
        const errorMsg = `Error parsing questions: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg);
        errors.push(errorMsg);
    }

    return {
        messages: [response],
        questions,
        currentStep: "validate",
        errors: errors.length > 0 ? errors : undefined,
    };
}

// Node: Validate questions
async function validateQuestions(state: QuizState): Promise<Partial<QuizState>> {
    const validQuestions = state.questions.filter((q) => {
        return (
            q.question &&
            q.options &&
            Object.keys(q.options).length === 4 &&
            q.correctAnswer &&
            q.explanation
        );
    });

    if (validQuestions.length === 10) {
        return {
            currentStep: "complete",
            questions: validQuestions,
        };
    } else {
        return {
            currentStep: "regenerate",
        };
    }
}

// Node: Regenerate if validation fails
async function regenerateQuestions(state: QuizState): Promise<Partial<QuizState>> {
    const attempts = state.validationAttempts ?? 0;
    const prompt = `The previous attempt didn't generate exactly 10 valid questions (attempt ${attempts}). Please generate exactly 10 multiple-choice questions about: "${state.topic}".

IMPORTANT: Return ONLY a valid JSON array, nothing else. Each question must have:
- question: string
- options: object with keys A, B, C, D
- correctAnswer: one of A, B, C, or D
- explanation: string

Example format:
[
  {
    "question": "What is the capital of France?",
    "options": {
      "A": "London",
      "B": "Paris",
      "C": "Berlin",
      "D": "Madrid"
    },
    "correctAnswer": "B",
    "explanation": "Paris is the capital and largest city of France."
  }
]`;

    const response = await model.invoke([new HumanMessage(prompt)]);

    let questions: QuizQuestion[] = [];
    const errors: string[] = [];
    
    try {
        const content = response.content as string;
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            questions = JSON.parse(jsonMatch[0]) as QuizQuestion[];
        } else {
            errors.push("No JSON array found in regeneration response");
        }
    } catch (error) {
        const errorMsg = `Error parsing regenerated questions: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg);
        errors.push(errorMsg);
    }

    return {
        messages: [...state.messages, response],
        questions,
        currentStep: "complete",
        errors: errors.length > 0 ? errors : undefined,
    };
}

// Conditional edge function
function shouldContinue(state: QuizState): "end" | "regenerate" {
    if (state.currentStep === "complete") {
        return "end";
    } else if (state.currentStep === "regenerate") {
        return "regenerate";
    }
    return "end";
}

// Create the graph
function createQuestionGeneratorGraph() {
    const workflow = new StateGraph<QuizState>({
        channels: {
            messages: {
                value: (x?: BaseMessage[], y?: BaseMessage[]) => (x ?? []).concat(y ?? []),
                default: () => [],
            },
            topic: {
                value: (x?: string, y?: string) => y ?? x ?? "",
                default: () => "",
            },
            questions: {
                value: (x?: QuizQuestion[], y?: QuizQuestion[]) => y ?? x ?? [],
                default: () => [],
            },
            currentStep: {
                value: (x?: WorkflowStep, y?: WorkflowStep) => y ?? x ?? "start",
                default: () => "start" as WorkflowStep,
            },
            validationAttempts: {
                value: (x?: number, y?: number) => y ?? x ?? 0,
                default: () => 0,
            },
            errors: {
                value: (x?: string[], y?: string[]) => (x ?? []).concat(y ?? []),
                default: () => [],
            },
        },
    });

    // Add nodes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workflow.addNode("generate", generateQuestions as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workflow.addNode("validate", validateQuestions as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workflow.addNode("regenerate", regenerateQuestions as any);

    // Add edges
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workflow.addEdge(START, "generate" as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workflow.addEdge("generate" as any, "validate" as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workflow.addConditionalEdges("validate" as any, shouldContinue as any, {
        end: END,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        regenerate: "regenerate" as any,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workflow.addEdge("regenerate" as any, END);

    return workflow.compile();
}

// Convex action to run the agent
export const generateQuizQuestions = action({
    args: {
        topic: v.string(),
    },
    handler: async (ctx, args) => {
        const { topic } = args;

        // Create the graph
        const app = createQuestionGeneratorGraph();

        // Run the graph
        const initialState: QuizState = {
            messages: [],
            topic,
            questions: [],
            currentStep: "start",
            validationAttempts: 0,
            errors: [],
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await app.invoke(initialState as any) as unknown as QuizState;

        return {
            success: true,
            topic,
            questions: result.questions || [],
            totalQuestions: (result.questions || []).length,
            validationAttempts: result.validationAttempts || 0,
            errors: result.errors || [],
        };
    },
});
