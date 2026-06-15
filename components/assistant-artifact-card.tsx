'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, BookOpen, CalendarClock, Flame, Layers3, ShieldAlert, Wrench } from 'lucide-react';
import type { AssistantArtifact } from '@/lib/ai/assistant-events';
import type { DailyBriefEntry } from '@/lib/ai/tools/types';

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function EntryList({
  items,
  compact,
}: {
  items: DailyBriefEntry[];
  compact?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-xs leading-5 text-stone-500">暂无足够引用情报。</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <Link
          key={`${item.itemId || item.title}-${index}`}
          href={item.href || '/#latest'}
          target={item.href ? '_blank' : undefined}
          rel={item.href ? 'noopener noreferrer' : undefined}
          className="group block rounded-lg border border-orange-100 bg-white px-3 py-2 transition-colors hover:border-orange-200 hover:bg-orange-50"
        >
          <span className="flex items-start gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-orange-100 text-[11px] font-semibold text-orange-800">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-5 text-stone-900">
                {item.title}
              </span>
              {!compact && (
                <span className="mt-1 block text-xs leading-5 text-stone-600">
                  {item.detail}
                </span>
              )}
            </span>
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-stone-400 group-hover:text-orange-700" />
          </span>
        </Link>
      ))}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4 className="flex items-center justify-between gap-2 text-sm font-semibold text-stone-950">
        <span className="inline-flex items-center gap-1.5">
          <Icon className="size-4 text-orange-700" />
          {title}
        </span>
        {typeof count === 'number' && (
          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">
            {count}
          </span>
        )}
      </h4>
      {children}
    </section>
  );
}

export function AssistantArtifactCard({ artifact }: { artifact: AssistantArtifact }) {
  if (artifact.type !== 'daily_brief') {
    return null;
  }

  const generatedAt = formatGeneratedAt(artifact.generatedAt);

  return (
    <div className="space-y-4 rounded-xl border border-orange-100 bg-white p-3 shadow-sm shadow-orange-900/5">
      <header className="rounded-lg bg-orange-50/70 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-orange-700">日报 Artifact</p>
            <h3 className="mt-1 text-base font-semibold leading-6 text-stone-950">
              {artifact.title}
            </h3>
          </div>
          {generatedAt && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] text-stone-500">
              <CalendarClock className="size-3.5" />
              {generatedAt}
            </span>
          )}
        </div>
      </header>

      <Section icon={Flame} title="今日 5 件事" count={artifact.topStories.length}>
        <EntryList items={artifact.topStories} />
      </Section>

      <Section icon={Layers3} title="主题聚类" count={artifact.clusters.length}>
        <div className="grid gap-2">
          {artifact.clusters.length > 0 ? artifact.clusters.map((cluster) => (
            <div key={cluster.title} className="rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2">
              <p className="text-sm font-medium text-stone-900">{cluster.title}</p>
              <p className="mt-1 text-xs leading-5 text-stone-600">{cluster.summary}</p>
            </div>
          )) : (
            <p className="text-xs leading-5 text-stone-500">暂无明显主题聚类。</p>
          )}
        </div>
      </Section>

      <Section icon={BookOpen} title="最值得深读" count={artifact.deepReads.length}>
        <EntryList items={artifact.deepReads} compact />
      </Section>

      <Section icon={ShieldAlert} title="风险 / 争议" count={artifact.risks.length}>
        <EntryList items={artifact.risks} />
      </Section>

      <Section icon={Wrench} title="给开发者的行动建议" count={artifact.developerActions.length}>
        <ul className="space-y-1.5">
          {artifact.developerActions.map((action) => (
            <li key={action} className="rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-700">
              {action}
            </li>
          ))}
        </ul>
      </Section>

      <div className="border-t border-orange-100 pt-3">
        <p className="mb-2 text-xs font-medium text-stone-500">引用情报列表</p>
        <div className="space-y-1.5">
          {artifact.references.map((reference) => (
            <Link
              key={reference.itemId}
              href={reference.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs leading-5 text-orange-700 underline decoration-orange-200 underline-offset-4 hover:text-orange-800"
            >
              #{reference.itemId} {reference.title} · {reference.source}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
