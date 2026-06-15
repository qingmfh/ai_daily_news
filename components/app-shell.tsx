'use client';

import type { ReactNode } from 'react';
import { Bot, Clock3, Database } from 'lucide-react';
import { Suspense, useState } from 'react';
import { AssistantPageContextProvider } from '@/components/assistant-page-context';
import { AssistantPanel } from '@/components/assistant-panel';
import { HeaderBackLink } from '@/components/header-back-link';
import { RefreshButton } from '@/components/refresh-button';

interface AppShellProps {
  children: ReactNode;
  stats: {
    total: number;
    today: number;
  };
}

export function AppShell({ children, stats }: AppShellProps) {
  const [assistantOpen, setAssistantOpen] = useState(false);

  return (
    <AssistantPageContextProvider>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-50 border-b border-orange-100/80 bg-[#fffaf4]/90 backdrop-blur">
          <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
            <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
              <Suspense fallback={null}>
                <HeaderBackLink />
              </Suspense>

              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700 ring-1 ring-orange-200">
                  <Bot className="size-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-base font-semibold text-stone-950 sm:text-lg">
                    AI Daily Agent
                  </h1>
                  <p className="hidden text-xs text-stone-500 sm:block">
                    AI news feed for Chinese builders
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-stone-600">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange-100 bg-white/80 px-2.5 py-1.5">
                  <Database className="size-3.5 text-orange-600" />
                  Total <strong className="text-stone-950">{stats.total}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange-100 bg-white/80 px-2.5 py-1.5">
                  <Clock3 className="size-3.5 text-teal-600" />
                  Today <strong className="text-stone-950">{stats.today}</strong>
                </span>
              </div>
            </div>

            <div className="flex items-center">
              <RefreshButton />
            </div>
          </div>
        </header>

        <main className={`flex-1 transition-[padding] duration-200 ${assistantOpen ? 'lg:pr-[452px]' : ''}`}>
          {children}
        </main>

        <footer className={`border-t border-orange-100/80 bg-white/70 transition-[padding] duration-200 ${assistantOpen ? 'lg:pr-[452px]' : ''}`}>
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p>AI Daily Agent</p>
            <p>Turn scattered AI updates into readable and searchable daily briefs.</p>
          </div>
        </footer>

        <AssistantPanel onOpenChange={setAssistantOpen} />
      </div>
    </AssistantPageContextProvider>
  );
}
