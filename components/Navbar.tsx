"use client";

import Image from "next/image";
import Link from "next/link";
import UserAvatar from "./UserAvatar";

export default function Navbar() {
    return (
        <nav className="sticky top-0 z-50 w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo Section */}
                    <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                        <div className="flex items-center gap-3">
                            <Image src="/convex.svg" alt="Convex Logo" width={32} height={32} />
                            <div className="w-px h-8 bg-slate-300 dark:bg-slate-600"></div>
                            <Image
                                src="/nextjs-icon-light-background.svg"
                                alt="Next.js Logo"
                                width={32}
                                height={32}
                                className="dark:hidden"
                            />
                            <Image
                                src="/nextjs-icon-dark-background.svg"
                                alt="Next.js Logo"
                                width={32}
                                height={32}
                                className="hidden dark:block"
                            />
                        </div>
                        <span className="hidden md:block font-semibold text-slate-800 dark:text-slate-200">
                            Convex + Next.js
                        </span>
                    </Link>

                    {/* User Avatar Section */}
                    <div className="flex items-center gap-4">
                        <UserAvatar />
                    </div>
                </div>
            </div>
        </nav>
    );
}
