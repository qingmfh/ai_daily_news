import {
  buildAssistantActions,
  type AssistantIntentId,
} from '@/lib/ai/assistant-workbench';
import {
  getAssistantReferenceItems,
  getItemById,
  type AssistantReferenceItem,
} from '@/lib/db/queries';
import { parseJsonArray } from '@/lib/utils';
import type {
  ActionToolResult,
  AssistantToolDefinition,
  CurrentItemToolResult,
  DailyBriefArtifact,
  DailyBriefEntry,
  ReferenceSearchToolResult,
} from './types';

export const assistantTools = {
  getCurrentItem: {
    name: 'get_current_item',
    label: '读取当前情报上下文',
  },
  searchReferences: {
    name: 'search_references',
    label: '检索本地情报引用',
  },
  buildActions: {
    name: 'build_actions',
    label: '准备操作卡片',
  },
  buildDailyBrief: {
    name: 'build_daily_brief',
    label: '生成日报卡片',
  },
  generateResponse: {
    name: 'generate_response',
    label: '生成回答',
  },
} satisfies Record<string, AssistantToolDefinition>;

function formatItemContext(item: NonNullable<Awaited<ReturnType<typeof getItemById>>>) {
  const tags = parseJsonArray(item.tags);
  const keyPoints = parseJsonArray(item.keyPoints);

  return [
    `中文标题：${item.titleCn || item.title}`,
    item.titleCn && item.titleCn !== item.title ? `原始标题：${item.title}` : '',
    `来源：${item.source}`,
    `原文链接：${item.url}`,
    item.publishedAt ? `发布时间：${item.publishedAt}` : '',
    item.category ? `类型：${item.category}` : '',
    item.importance ? `重要性：${item.importance}/5` : '',
    item.reason ? `推荐理由：${item.reason}` : '',
    item.summaryCn ? `中文摘要：${item.summaryCn}` : '',
    item.summary ? `原始摘要：${item.summary}` : '',
    keyPoints.length > 0 ? `核心要点：\n${keyPoints.map((point) => `- ${point}`).join('\n')}` : '',
    tags.length > 0 ? `标签：${tags.join('、')}` : '',
    item.contentExcerpt ? `正文片段：${item.contentExcerpt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function formatReferenceContext(items: AssistantReferenceItem[]) {
  if (items.length === 0) {
    return '';
  }

  const itemBlocks = items.map((item) => {
    const tags = parseJsonArray(item.tags);
    const keyPoints = parseJsonArray(item.keyPoints);

    return [
      `[#${item.id}] ${item.titleCn || item.title}`,
      `引用链接：${item.url}`,
      `来源：${item.source}`,
      item.publishedAt ? `发布时间：${item.publishedAt}` : '',
      item.category ? `类型：${item.category}` : '',
      item.importance ? `重要性：${item.importance}/5` : '',
      item.reason ? `推荐理由：${item.reason}` : '',
      item.summaryCn ? `中文摘要：${item.summaryCn}` : '',
      item.summary ? `原始摘要：${item.summary}` : '',
      keyPoints.length > 0 ? `核心要点：${keyPoints.join('；')}` : '',
      tags.length > 0 ? `标签：${tags.join('、')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  return [
    '可引用情报：',
    '以下条目来自本地数据库。回答事实性结论时，如果使用了某条信息，请用 Markdown 链接引用，例如 [#123](https://example.com)。',
    itemBlocks.join('\n\n'),
  ].join('\n\n');
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/[\[\]]/g, '').trim();
}

function escapeMarkdownUrl(value: string) {
  return value.replace(/[<>]/g, '').trim();
}

function buildReferenceFooter(items: AssistantReferenceItem[]) {
  if (items.length === 0) {
    return '';
  }

  const lines = items.map((item) => {
    const title = escapeMarkdownLabel(item.titleCn || item.title);
    const url = escapeMarkdownUrl(item.url);
    const source = item.source || '未知来源';
    const importance = item.importance ? ` · ${item.importance}/5` : '';

    return `- [#${item.id} ${title}](<${url}>) · ${source}${importance}`;
  });

  return `\n\n---\n参考情报\n${lines.join('\n')}`;
}

function getDisplayTitle(item: AssistantReferenceItem) {
  return item.titleCn || item.title;
}

function getDisplayDetail(item: AssistantReferenceItem) {
  return item.reason || item.summaryCn || item.summary || '这条情报值得继续阅读和核对原文。';
}

function toBriefEntry(item: AssistantReferenceItem): DailyBriefEntry {
  return {
    itemId: item.id,
    title: getDisplayTitle(item),
    detail: getDisplayDetail(item),
    href: item.url,
  };
}

function getClusterKey(item: AssistantReferenceItem) {
  const tags = parseJsonArray(item.tags);
  return tags[0] || item.category || item.source || '综合动态';
}

function buildThemeClusters(items: AssistantReferenceItem[]) {
  const groups = new Map<string, AssistantReferenceItem[]>();

  for (const item of items) {
    const key = getClusterKey(item);
    groups.set(key, [...(groups.get(key) || []), item]);
  }

  return Array.from(groups.entries())
    .sort(([, left], [, right]) => right.length - left.length)
    .slice(0, 4)
    .map(([title, group]) => ({
      title,
      summary: group.slice(0, 2).map(getDisplayTitle).join('；'),
      itemIds: group.map((item) => item.id),
    }));
}

function buildRiskEntries(items: AssistantReferenceItem[]) {
  const riskPattern = /安全|风险|隐私|监管|争议|攻击|漏洞|malware|risk|safety|privacy|security|concern/i;
  const riskyItems = items.filter((item) => {
    const text = [
      item.title,
      item.titleCn,
      item.summary,
      item.summaryCn,
      item.reason,
      item.tags,
    ].filter(Boolean).join(' ');

    return riskPattern.test(text);
  });

  if (riskyItems.length > 0) {
    return riskyItems.slice(0, 3).map(toBriefEntry);
  }

  return items.slice(0, 1).map((item) => ({
    itemId: item.id,
    title: '暂无明显集中风险信号',
    detail: `当前引用情报更偏向进展和工具动态，仍建议核对 ${getDisplayTitle(item)} 等原文背景。`,
    href: item.url,
  }));
}

function buildDeveloperActions(items: AssistantReferenceItem[]) {
  const topItem = items[0];
  const topTitle = topItem ? getDisplayTitle(topItem) : '今日重点情报';
  const clusters = buildThemeClusters(items).map((cluster) => cluster.title).slice(0, 2);

  return [
    `先阅读「${topTitle}」，确认今天最强信号。`,
    clusters.length > 0
      ? `围绕 ${clusters.join('、')} 建立后续关注列表。`
      : '按重要性从高到低继续浏览引用情报。',
    '把涉及安全、开发工具或模型能力变化的内容标记为后续深读候选。',
  ];
}

export async function getCurrentItemContextTool(itemId: number): Promise<CurrentItemToolResult | null> {
  const item = await getItemById(itemId);
  if (!item) {
    return null;
  }

  return {
    context: formatItemContext(item),
    summary: `已读取情报 #${item.id}`,
  };
}

export async function searchReferencesTool({
  message,
  itemId,
}: {
  message: string;
  itemId?: number;
}): Promise<ReferenceSearchToolResult> {
  const items = await getAssistantReferenceItems({
    query: message,
    itemId,
  });

  return {
    items,
    context: formatReferenceContext(items),
    footer: buildReferenceFooter(items),
    summary: `找到 ${items.length} 条可引用情报`,
  };
}

export function buildActionsTool({
  intent,
  message,
  itemId,
  hasReferences,
}: {
  intent?: AssistantIntentId;
  message: string;
  itemId?: number;
  hasReferences: boolean;
}): ActionToolResult {
  const actions = buildAssistantActions({
    intent,
    message,
    itemId,
    hasReferences,
  });

  return {
    actions,
    summary: actions.map((action) => action.label).join('、'),
  };
}

export function buildDailyBriefArtifactTool(items: AssistantReferenceItem[]): DailyBriefArtifact {
  const sortedItems = [...items].sort((left, right) => (
    (right.importance || 0) - (left.importance || 0)
  ));

  const references = sortedItems.slice(0, 8).map((item) => ({
    itemId: item.id,
    title: getDisplayTitle(item),
    source: item.source,
    href: item.url,
  }));

  return {
    id: `daily-brief-${Date.now()}`,
    type: 'daily_brief',
    title: '今日 AI 情报日报',
    generatedAt: new Date().toISOString(),
    topStories: sortedItems.slice(0, 5).map(toBriefEntry),
    clusters: buildThemeClusters(sortedItems),
    deepReads: sortedItems.slice(0, 3).map(toBriefEntry),
    risks: buildRiskEntries(sortedItems),
    developerActions: buildDeveloperActions(sortedItems),
    references,
  };
}
