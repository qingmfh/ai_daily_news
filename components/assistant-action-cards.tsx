'use client';

import Link from 'next/link';
import { ArrowRight, MessageSquareText, Route, Search } from 'lucide-react';
import type { AssistantAction, AssistantIntentId } from '@/lib/ai/assistant-workbench';

export function AssistantActionCards({
  actions,
  disabled,
  onPrompt,
}: {
  actions?: AssistantAction[];
  disabled?: boolean;
  onPrompt: (message: string, intent?: AssistantIntentId) => void;
}) {
  if (!actions?.length) {
    return null;
  }

  return (
    <div className="mt-3 rounded-xl border border-orange-100 bg-white p-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600">
          <Route className="size-3.5 text-orange-700" />
          下一步
        </span>
      </div>
      <div className="grid gap-2">
        {actions.map((action) => {
          if (action.type === 'filter') {
            return (
              <Link
                key={action.id}
                href={action.href}
                className="group flex items-center gap-2 rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2 text-left transition-colors hover:border-orange-200 hover:bg-orange-50"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-700">
                  <Search className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-5 text-stone-900">
                    {action.label}
                  </span>
                  <span className="block text-xs leading-5 text-stone-500">
                    {action.description}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-stone-400 transition-colors group-hover:text-orange-700" />
              </Link>
            );
          }

          return (
            <button
              key={action.id}
              type="button"
              disabled={disabled}
              onClick={() => onPrompt(action.message, action.intent)}
              className="group flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50/55 px-3 py-2 text-left transition-colors hover:border-teal-200 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                <MessageSquareText className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-5 text-stone-900">
                  {action.label}
                </span>
                <span className="block text-xs leading-5 text-stone-500">
                  {action.description}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-stone-400 transition-colors group-hover:text-orange-700" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
