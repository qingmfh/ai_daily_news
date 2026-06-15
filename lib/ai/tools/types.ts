import type { AssistantAction, AssistantIntentId } from '@/lib/ai/assistant-workbench';
import type { AssistantReferenceItem } from '@/lib/db/queries';

export type AssistantToolName =
  | 'get_current_item'
  | 'search_references'
  | 'build_actions'
  | 'build_daily_brief'
  | 'generate_response';

export type AssistantToolDefinition = {
  name: AssistantToolName;
  label: string;
};

export type AssistantToolRequest = {
  message: string;
  intent?: AssistantIntentId;
  itemId?: number;
};

export type CurrentItemToolResult = {
  context: string;
  summary: string;
};

export type ReferenceSearchToolResult = {
  items: AssistantReferenceItem[];
  context: string;
  footer: string;
  summary: string;
};

export type ActionToolResult = {
  actions: AssistantAction[];
  summary: string;
};

export type DailyBriefEntry = {
  itemId?: number;
  title: string;
  detail: string;
  href?: string;
};

export type DailyBriefCluster = {
  title: string;
  summary: string;
  itemIds: number[];
};

export type DailyBriefArtifact = {
  id: string;
  type: 'daily_brief';
  title: string;
  generatedAt: string;
  topStories: DailyBriefEntry[];
  clusters: DailyBriefCluster[];
  deepReads: DailyBriefEntry[];
  risks: DailyBriefEntry[];
  developerActions: string[];
  references: Array<{
    itemId: number;
    title: string;
    source: string;
    href: string;
  }>;
};
