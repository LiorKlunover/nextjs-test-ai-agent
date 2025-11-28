"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { api } from "../convex/_generated/api";

export default function UserAvatar() {
    const { isAuthenticated, isLoading } = useConvexAuth();
    const { signOut } = useAuthActions();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Fetch user info if authenticated
    // We need a query to get the current user. 
    // In app/page.tsx, it uses api.myFunctions.listNumbers which returns viewer. 
    // I should probably create a specific query for 'me' or just use the viewer from listNumbers for now if it's efficient, 
    // but better to have a dedicated 'viewer' query. 
    // For now, I'll use the same pattern as page.tsx or just display a generic avatar if I can't easily get the name without a new query.
    // Actually, page.tsx gets viewer from api.myFunctions.listNumbers. 
    // Let's see if I can use that or if I should just show a placeholder.
    // The user asked for "show user when login". 
    // I'll try to fetch the viewer. 

    const { viewer } = useQuery(api.myFunctions.listNumbers, { count: 1 }) ?? {};

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    if (isLoading) return null;

    if (!isAuthenticated) {
        return (
            <button
                onClick={() => router.push("/signin")}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
                Sign In
            </button>
        );
    }

    const userInitial = viewer ? viewer.charAt(0).toUpperCase() : "U";

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
                <span className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                    {userInitial}
                </span>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-md shadow-lg py-1 ring-1 ring-black ring-opacity-5 z-50">
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                        <p className="text-sm text-slate-500 dark:text-slate-400">Signed in as</p>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {viewer ?? "User"}
                        </p>
                    </div>
                    <button
                        onClick={() => void signOut().then(() => router.push("/signin"))}
                        className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                        Sign out
                    </button>
                </div>
            )}
        </div>
    );
}
