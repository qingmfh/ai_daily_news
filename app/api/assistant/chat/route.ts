import { NextRequest, NextResponse } from 'next/server';
import { createAssistantChatStream, type AssistantMessage } from '@/lib/ai/chat';
import type { AssistantStreamEvent } from '@/lib/ai/assistant-events';
import type { AssistantIntentId } from '@/lib/ai/assistant-workbench';
import {
  assistantTools,
  buildActionsTool,
  buildDailyBriefArtifactTool,
  getCurrentItemContextTool,
  searchReferencesTool,
} from '@/lib/ai/tools';

type ChatRequestBody = {
  message?: string;
  intent?: AssistantIntentId;
  itemId?: number;
  pageContent?: string;
  history?: AssistantMessage[];
};

const encoder = new TextEncoder();

function normalizeHistory(history: unknown): AssistantMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item): item is AssistantMessage => (
      item &&
      typeof item === 'object' &&
      (item as AssistantMessage).role !== undefined &&
      ['user', 'assistant'].includes((item as AssistantMessage).role) &&
      typeof (item as AssistantMessage).content === 'string'
    ))
    .slice(-8);
}

function formatSseEvent(event: AssistantStreamEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function enqueueEvent(controller: ReadableStreamDefaultController<Uint8Array>, event: AssistantStreamEvent) {
  controller.enqueue(encoder.encode(formatSseEvent(event)));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ChatRequestBody;
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json(
        { error: '请输入问题或指令' },
        { status: 400 }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const contexts: string[] = [];

          if (body.itemId) {
            enqueueEvent(controller, {
              type: 'tool_call',
              id: 'get-current-item',
              name: assistantTools.getCurrentItem.name,
              label: assistantTools.getCurrentItem.label,
            });

            const currentItemResult = await getCurrentItemContextTool(body.itemId);
            if (!currentItemResult) {
              enqueueEvent(controller, {
                type: 'error',
                message: '情报不存在',
              });
              enqueueEvent(controller, { type: 'done' });
              controller.close();
              return;
            }

            contexts.push(currentItemResult.context);
            enqueueEvent(controller, {
              type: 'tool_result',
              id: 'get-current-item',
              name: assistantTools.getCurrentItem.name,
              label: assistantTools.getCurrentItem.label,
              summary: currentItemResult.summary,
            });
          }

          if (body.pageContent?.trim()) {
            contexts.push(`当前页面展示内容：\n${body.pageContent.trim()}`);
          }

          if (contexts.length === 0) {
            contexts.push('当前没有额外页面上下文。请基于用户问题直接回答，并在必要时提醒用户补充页面内容。');
          }

          enqueueEvent(controller, {
            type: 'tool_call',
            id: 'search-references',
            name: assistantTools.searchReferences.name,
            label: assistantTools.searchReferences.label,
          });

          const referenceResult = await searchReferencesTool({
            message,
            itemId: body.itemId,
          });

          if (referenceResult.context) {
            contexts.push(referenceResult.context);
          }

          enqueueEvent(controller, {
            type: 'tool_result',
            id: 'search-references',
            name: assistantTools.searchReferences.name,
            label: assistantTools.searchReferences.label,
            summary: referenceResult.summary,
          });

          const actionResult = buildActionsTool({
            intent: body.intent,
            message,
            itemId: body.itemId,
            hasReferences: referenceResult.items.length > 0,
          });

          if (body.intent === 'today_focus') {
            enqueueEvent(controller, {
              type: 'tool_call',
              id: 'build-daily-brief',
              name: assistantTools.buildDailyBrief.name,
              label: assistantTools.buildDailyBrief.label,
            });

            const dailyBrief = buildDailyBriefArtifactTool(referenceResult.items);
            enqueueEvent(controller, {
              type: 'artifact',
              artifact: dailyBrief,
            });
            enqueueEvent(controller, {
              type: 'tool_result',
              id: 'build-daily-brief',
              name: assistantTools.buildDailyBrief.name,
              label: assistantTools.buildDailyBrief.label,
              summary: `已生成 ${dailyBrief.topStories.length} 条重点日报`,
            });
          }

          enqueueEvent(controller, {
            type: 'tool_call',
            id: 'generate-response',
            name: assistantTools.generateResponse.name,
            label: assistantTools.generateResponse.label,
          });

          const completionStream = await createAssistantChatStream({
            message,
            context: contexts.join('\n\n---\n\n'),
            history: normalizeHistory(body.history),
          });

          for await (const chunk of completionStream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              enqueueEvent(controller, {
                type: 'delta',
                content,
              });
            }
          }

          if (referenceResult.footer) {
            enqueueEvent(controller, {
              type: 'delta',
              content: referenceResult.footer,
            });
          }

          enqueueEvent(controller, {
            type: 'tool_result',
            id: 'generate-response',
            name: assistantTools.generateResponse.name,
            label: assistantTools.generateResponse.label,
            summary: '回答已生成',
          });

          if (actionResult.actions.length > 0) {
            enqueueEvent(controller, {
              type: 'actions',
              actions: actionResult.actions,
            });
          }
        } catch (error) {
          console.error('AI assistant stream failed:', error);
          enqueueEvent(controller, {
            type: 'error',
            message: 'AI 助手暂时不可用，请稍后重试',
          });
        }

        enqueueEvent(controller, { type: 'done' });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('AI assistant request failed:', error);
    return NextResponse.json(
      { error: 'AI 助手暂时不可用，请稍后重试' },
      { status: 500 }
    );
  }
}
