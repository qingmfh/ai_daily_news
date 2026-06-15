import type { AssistantAction } from '@/lib/ai/assistant-workbench';
import type { AssistantToolName, DailyBriefArtifact } from '@/lib/ai/tools/types';

export type AssistantToolEvent = {
  id: string;
  name: AssistantToolName;
  label: string;
};

export type AssistantArtifact = DailyBriefArtifact;

export type AssistantStreamEvent =
  | {
      type: 'delta';
      content: string;
    }
  | ({
      type: 'tool_call';
    } & AssistantToolEvent)
  | ({
      type: 'tool_result';
      summary: string;
    } & AssistantToolEvent)
  | {
      type: 'artifact';
      artifact: AssistantArtifact;
    }
  | {
      type: 'actions';
      actions: AssistantAction[];
    }
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'done';
    };
