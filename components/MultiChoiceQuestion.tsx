"use client";

import React from "react";

// Check and X icons as SVG components
const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
);

const XIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);

const InfoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
)

interface Question {
    question: string;
    options: {
        A: string;
        B: string;
        C: string;
        D: string;
    };
    correctAnswer: string;
    explanation: string;
}

interface MultiChoiceQuestionProps {
    question: Question;
    index: number;
    selectedAnswer: string | undefined;
    showResults: boolean;
    onAnswerSelect: (questionIndex: number, answer: string) => void;
}

export default function MultiChoiceQuestion({
    question,
    index,
    selectedAnswer,
    showResults,
    onAnswerSelect,
}: MultiChoiceQuestionProps) {
    return (
        <div
            className="bg-white rounded-2xl shadow-lg p-6 md:p-8 hover:shadow-xl transition-all duration-300 border border-gray-100"
        >
            <div className="flex items-start">
                <span className="text-2xl font-bold text-purple-600 mr-4">{index + 1}.</span>
                <h3 className="text-xl font-semibold text-gray-800 flex-1">
                    {question.question}
                </h3>
            </div>

            <div className="mt-6 space-y-4">
                {Object.entries(question.options).map(([key, value]) => {
                    const isSelected = selectedAnswer === key;
                    const isCorrect = key === question.correctAnswer;
                    const showCorrect = showResults && isCorrect;
                    const showIncorrect = showResults && isSelected && !isCorrect;

                    let buttonClass = "border-gray-300 bg-white hover:bg-purple-50 hover:border-purple-400";
                    if (showResults) {
                        if (showCorrect) {
                            buttonClass = "border-green-500 bg-green-100 text-green-800";
                        } else if (showIncorrect) {
                            buttonClass = "border-red-500 bg-red-100 text-red-800";
                        } else if (isCorrect) {
                            buttonClass = "border-green-500 bg-green-50";
                        }
                    } else if (isSelected) {
                        buttonClass = "border-purple-600 bg-purple-100 ring-2 ring-purple-300";
                    }

                    return (
                        <button
                            key={key}
                            onClick={() => !showResults && onAnswerSelect(index, key)}
                            disabled={showResults}
                            className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between ${buttonClass} ${showResults ? "cursor-default" : "cursor-pointer"}`}
                        >
                            <div className="flex items-center">
                                <span className="font-bold mr-3 text-purple-700">{key}</span>
                                <span className="text-gray-900">{value}</span>
                            </div>
                            {showCorrect && <CheckIcon />}
                            {showIncorrect && <XIcon />}
                        </button>
                    );
                })}
            </div>

            {showResults && (
                <div className="mt-6 p-4 bg-indigo-50 border-l-4 border-indigo-400 rounded-r-lg">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <InfoIcon />
                        </div>
                        <div className="ml-3">
                            <h4 className="text-sm font-bold text-indigo-800">Explanation</h4>
                            <p className="mt-1 text-sm text-indigo-700">
                                {question.explanation}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
