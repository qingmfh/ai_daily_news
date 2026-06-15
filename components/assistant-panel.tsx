'use client';

import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  ChevronDown,
  GitBranch,
  Grip,
  Lightbulb,
  ListChecks,
  Loader2,
  Pause,
  Search,
  SendHorizontal,
  Wrench,
  X,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { AssistantActionCards } from '@/components/assistant-action-cards';
import { AssistantArtifactCard } from '@/components/assistant-artifact-card';
import { useAssistantPageContext } from '@/components/assistant-page-context';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import type { AssistantArtifact, AssistantStreamEvent } from '@/lib/ai/assistant-events';
import {
  getAssistantQuickIntents,
  type AssistantAction,
  type AssistantIntentId,
} from '@/lib/ai/assistant-workbench';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  actions?: AssistantAction[];
  activities?: AssistantActivity[];
  artifacts?: AssistantArtifact[];
};

type AssistantActivity = {
  id: string;
  label: string;
  status: 'running' | 'completed';
  summary?: string;
};

interface AssistantPanelProps {
  onOpenChange?: (open: boolean) => void;
}

const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 640;
const PANEL_TOP_OFFSET = 72;
const PANEL_BOTTOM_GAP = 8;

const defaultMessages: ChatMessage[] = [
  {
    role: 'assistant',
    content: '我会跟着你在首页和情报详情之间一起走。直接问我就行。',
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCurrentItemId(pathname: string): number | undefined {
  const match = pathname.match(/^\/items\/(\d+)$/);
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function getDefaultPosition() {
  if (typeof window === 'undefined') {
    return { x: 24, y: 96 };
  }

  return {
    x: Math.max(24, window.innerWidth - PANEL_WIDTH - 24),
    y: 96,
  };
}

function getPanelHeight(viewportHeight: number) {
  return Math.min(PANEL_HEIGHT, Math.max(420, viewportHeight - PANEL_TOP_OFFSET - PANEL_BOTTOM_GAP));
}

function appendToLastAssistant(messages: ChatMessage[], content: string): ChatMessage[] {
  const nextMessages = [...messages];
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    if (nextMessages[index].role === 'assistant') {
      nextMessages[index] = {
        ...nextMessages[index],
        role: 'assistant',
        content: `${nextMessages[index].content}${content}`,
      };
      return nextMessages;
    }
  }

  return [...nextMessages, { role: 'assistant', content }];
}

function replaceLastAssistant(messages: ChatMessage[], content: string): ChatMessage[] {
  const nextMessages = [...messages];
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    if (nextMessages[index].role === 'assistant') {
      nextMessages[index] = { ...nextMessages[index], role: 'assistant', content };
      return nextMessages;
    }
  }

  return [...nextMessages, { role: 'assistant', content }];
}

function setLastAssistantActivity(
  messages: ChatMessage[],
  activity: AssistantActivity
): ChatMessage[] {
  const nextMessages = [...messages];

  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    if (nextMessages[index].role !== 'assistant') {
      continue;
    }

    const activities = nextMessages[index].activities || [];
    const existingIndex = activities.findIndex((item) => item.id === activity.id);
    const nextActivities = [...activities];

    if (existingIndex >= 0) {
      nextActivities[existingIndex] = {
        ...nextActivities[existingIndex],
        ...activity,
      };
    } else {
      nextActivities.push(activity);
    }

    nextMessages[index] = {
      ...nextMessages[index],
      activities: nextActivities,
    };
    return nextMessages;
  }

  return messages;
}

function completeRunningAssistantActivities(messages: ChatMessage[], summary: string): ChatMessage[] {
  const nextMessages = [...messages];

  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const item = nextMessages[index];
    if (item.role !== 'assistant' || !item.activities?.length) {
      continue;
    }

    nextMessages[index] = {
      ...item,
      activities: item.activities.map((activity) => (
        activity.status === 'running'
          ? { ...activity, status: 'completed', summary }
          : activity
      )),
    };
    return nextMessages;
  }

  return messages;
}

function getVisibleActivities(activities: AssistantActivity[] | undefined, hasOutput: boolean) {
  if (!activities?.length) {
    return [];
  }

  const runningActivities = activities.filter((activity) => activity.status === 'running');
  if (runningActivities.length > 0) {
    return runningActivities;
  }

  return hasOutput ? [] : activities;
}

function setLastAssistantActions(messages: ChatMessage[], actions: AssistantAction[]): ChatMessage[] {
  if (actions.length === 0) {
    return messages;
  }

  const nextMessages = [...messages];
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    if (nextMessages[index].role === 'assistant') {
      nextMessages[index] = {
        ...nextMessages[index],
        actions,
      };
      return nextMessages;
    }
  }

  return messages;
}

function appendLastAssistantArtifact(
  messages: ChatMessage[],
  artifact: AssistantArtifact
): ChatMessage[] {
  const nextMessages = [...messages];

  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    if (nextMessages[index].role === 'assistant') {
      nextMessages[index] = {
        ...nextMessages[index],
        artifacts: [...(nextMessages[index].artifacts || []), artifact],
      };
      return nextMessages;
    }
  }

  return messages;
}

function parseSseBlock(block: string): AssistantStreamEvent | null {
  try {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');

    return data ? JSON.parse(data) as AssistantStreamEvent : null;
  } catch {
    return null;
  }
}

function getIntentIcon(intent: AssistantIntentId) {
  switch (intent) {
    case 'today_focus':
      return CalendarDays;
    case 'weekly_agent':
      return GitBranch;
    case 'latest_papers':
      return BookOpen;
    case 'new_tools':
      return Wrench;
    case 'study_plan':
      return ListChecks;
    case 'summarize_current':
      return Lightbulb;
    case 'why_current':
      return BarChart3;
    case 'related_current':
      return Search;
    case 'compare_current':
      return BarChart3;
  }
}

export function AssistantPanel({ onOpenChange }: AssistantPanelProps) {
  const pathname = usePathname();
  const itemId = getCurrentItemId(pathname);
  const { pageContext } = useAssistantPageContext();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(defaultMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window === 'undefined' ? 900 : window.innerHeight
  );
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    getDefaultPosition()
  );
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const desktopMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const mobileMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const panelHeight = getPanelHeight(viewportHeight);
  const quickIntents = getAssistantQuickIntents(itemId ? 'detail' : 'home');

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setViewportHeight((current) => (
        current === window.innerHeight ? current : window.innerHeight
      ));

      setPosition((current) => {
        if (!current) {
          return current;
        }

        const nextX = clamp(current.x, 8, Math.max(8, window.innerWidth - PANEL_WIDTH - 8));
        const nextY = clamp(
          current.y,
          PANEL_TOP_OFFSET,
          Math.max(PANEL_TOP_OFFSET, window.innerHeight - getPanelHeight(window.innerHeight) - PANEL_BOTTOM_GAP)
        );

        if (nextX === current.x && nextY === current.y) {
          return current;
        }

        return { x: nextX, y: nextY };
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    desktopMessagesEndRef.current?.scrollIntoView({ block: 'end' });
    mobileMessagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, isLoading]);

  const scopeLabel = itemId ? `当前上下文：情报 #${itemId}` : '当前上下文：首页情报流';

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!position) {
      return;
    }

    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };

    const handleMove = (moveEvent: PointerEvent) => {
      if (!dragState.current) {
        return;
      }

      const nextX = dragState.current.originX + (moveEvent.clientX - dragState.current.startX);
      const nextY = dragState.current.originY + (moveEvent.clientY - dragState.current.startY);

      setPosition({
        x: clamp(nextX, 8, Math.max(8, window.innerWidth - PANEL_WIDTH - 8)),
        y: clamp(nextY, PANEL_TOP_OFFSET, Math.max(PANEL_TOP_OFFSET, window.innerHeight - panelHeight - PANEL_BOTTOM_GAP)),
      });
    };

    const handleUp = () => {
      dragState.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const askAssistant = async (question: string, intent?: AssistantIntentId) => {
    const trimmed = question.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const history = messages.slice(-6);
    setMessages((current) => [
      ...current,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: '' },
    ]);
    setMessage('');
    setIsLoading(true);

    try {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        signal: abortController.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: trimmed,
          intent,
          itemId,
          pageContent: pageContext?.content,
          history,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(errorData?.error || 'AI 助手请求失败');
      }

      if (!response.body) {
        throw new Error('AI 助手没有返回可读取的响应流');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handleEvent = (event: AssistantStreamEvent | null) => {
        if (!event) {
          return;
        }

        if (event.type === 'delta') {
          setMessages((current) => appendToLastAssistant(current, event.content));
          return;
        }

        if (event.type === 'tool_call') {
          setMessages((current) => setLastAssistantActivity(current, {
            id: event.id,
            label: event.label,
            status: 'running',
          }));
          return;
        }

        if (event.type === 'tool_result') {
          setMessages((current) => setLastAssistantActivity(current, {
            id: event.id,
            label: event.label,
            status: 'completed',
            summary: event.summary,
          }));
          return;
        }

        if (event.type === 'actions') {
          setMessages((current) => setLastAssistantActions(current, event.actions));
          return;
        }

        if (event.type === 'artifact') {
          setMessages((current) => appendLastAssistantArtifact(current, event.artifact));
          return;
        }

        if (event.type === 'error') {
          setMessages((current) => replaceLastAssistant(current, `抱歉，${event.message}`));
        }
      };

      const readEvents = (chunk: string) => {
        buffer = `${buffer}${chunk}`.replace(/\r\n/g, '\n');
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          handleEvent(parseSseBlock(block));
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          readEvents(chunk);
        }
      }

      const rest = decoder.decode();
      if (rest) {
        readEvents(rest);
      }

      if (buffer.trim()) {
        handleEvent(parseSseBlock(buffer));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages((current) => completeRunningAssistantActivities(current, '已停止'));
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'AI 助手请求失败';
      setMessages((current) => replaceLastAssistant(current, `抱歉，${errorMessage}`));
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const stopAssistant = () => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void askAssistant(message);
    }
  };

  const renderQuickIntents = () => (
    <div className="mb-3 rounded-xl border border-orange-100 bg-orange-50/45 p-2">
      <div className="grid grid-cols-2 gap-2">
        {quickIntents.map((intent) => {
          const Icon = getIntentIcon(intent.id);

          return (
            <button
              key={intent.id}
              type="button"
              title={intent.description}
              disabled={isLoading}
              onClick={() => void askAssistant(intent.message, intent.id)}
              className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-orange-100 bg-white px-2.5 text-left text-xs font-medium text-stone-700 shadow-sm shadow-orange-900/4 transition-colors hover:border-orange-200 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon className="size-3.5 shrink-0 text-orange-700" />
              <span className="truncate">{intent.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderActivities = (activities?: AssistantActivity[], hasOutput = false) => {
    const visibleActivities = getVisibleActivities(activities, hasOutput);

    if (visibleActivities.length === 0) {
      return null;
    }

    return (
      <div className="mb-3 space-y-1.5">
        {visibleActivities.map((activity) => (
          <div
            key={activity.id}
            className="flex items-start gap-2 rounded-lg border border-orange-100 bg-white px-2.5 py-2 text-xs leading-5 text-stone-600"
          >
            {activity.status === 'running' ? (
              <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-orange-700" />
            ) : (
              <span className="mt-1 size-2 shrink-0 rounded-full bg-teal-500" />
            )}
            <span className="min-w-0">
              <span className="font-medium text-stone-800">{activity.label}</span>
              {activity.summary && (
                <span className="block text-stone-500">{activity.summary}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderMessages = (endRef: typeof desktopMessagesEndRef, mobile = false) => (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain rounded-xl border border-orange-100 bg-white p-3">
      {messages.map((item, index) => {
        const hasWorkbenchOutput = Boolean(item.actions?.length || item.artifacts?.length);
        const hasAssistantOutput = Boolean(item.content || item.actions?.length || item.artifacts?.length);

        return (
          <div
            key={`${mobile ? 'mobile-' : ''}${item.role}-${index}`}
            className={`text-sm leading-6 ${
              item.role === 'user'
                ? `${mobile ? 'max-w-[90%]' : 'max-w-[86%]'} ml-auto rounded-2xl bg-orange-600 px-3 py-2 text-white`
                : `${hasWorkbenchOutput ? 'w-full rounded-xl border border-orange-100 bg-orange-50/55 p-2.5' : `${mobile ? 'max-w-[94%]' : 'max-w-[90%]'} mr-auto rounded-2xl bg-orange-50 px-3 py-2`} text-stone-700`
            }`}
          >
            {item.role === 'assistant' ? (
              hasAssistantOutput || item.activities?.length ? (
                <>
                  {renderActivities(item.activities, hasAssistantOutput)}
                  {item.artifacts?.map((artifact) => (
                    <AssistantArtifactCard key={artifact.id} artifact={artifact} />
                  ))}
                  {item.content && (
                    <div className={item.artifacts?.length ? 'mt-3' : undefined}>
                      <MarkdownRenderer content={item.content} />
                    </div>
                  )}
                  <AssistantActionCards
                    actions={item.actions}
                    disabled={isLoading}
                    onPrompt={(nextMessage, intent) => void askAssistant(nextMessage, intent)}
                  />
                </>
              ) : (
                <span className="inline-flex items-center gap-2 text-stone-500">
                  <Loader2 className="size-4 animate-spin text-orange-700" />
                  思考中
                </span>
              )
            ) : (
              <p className="whitespace-pre-wrap">{item.content}</p>
            )}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );

  const renderComposer = () => (
    <div className="mt-3 flex items-end gap-2 rounded-xl border border-orange-100 bg-white p-2 shadow-sm shadow-orange-900/4">
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={handleComposerKeyDown}
        rows={2}
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        aria-label="AI 助手对话输入框"
        disabled={isLoading}
        className="max-h-28 min-h-16 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm leading-6 text-stone-700 outline-none placeholder:text-stone-400 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <button
        type="button"
        onClick={() => {
          if (isLoading) {
            stopAssistant();
            return;
          }
          void askAssistant(message);
        }}
        disabled={!isLoading && !message.trim()}
        className="mb-1 flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
        aria-label={isLoading ? '停止 AI 助手回答' : '发送消息'}
        title={isLoading ? '停止回答' : '发送'}
      >
        {isLoading ? <Pause className="size-4" /> : <SendHorizontal className="size-4" />}
      </button>
    </div>
  );

  const desktopPosition = position ?? { x: 24, y: 96 };

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-full border border-orange-200 bg-white text-orange-700 shadow-lg shadow-orange-900/15 transition-transform hover:scale-[1.03] hover:bg-orange-50"
          aria-label="打开 AI 智能助手"
        >
          <Bot className="size-6" />
        </button>
      )}

      {isOpen && (
        <div
          className="fixed z-40 hidden lg:block"
          style={{ left: `${desktopPosition.x}px`, top: `${desktopPosition.y}px` }}
        >
          <aside
            className="surface-soft flex w-[420px] flex-col overflow-hidden rounded-xl bg-white/96"
            style={{ height: `${panelHeight}px` }}
          >
            <div
              onPointerDown={startDrag}
              className="flex cursor-move items-center justify-between border-b border-orange-100 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                  <Bot className="size-5" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-stone-950">AI 智能助手</h2>
                  <p className="text-xs text-stone-500">{scopeLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-flex size-8 items-center justify-center text-stone-400">
                  <Grip className="size-4" />
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex size-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-orange-50 hover:text-orange-700"
                  aria-label="收起 AI 智能助手"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-3">
              {renderQuickIntents()}
              {renderMessages(desktopMessagesEndRef)}
              {renderComposer()}
            </div>
          </aside>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-x-3 bottom-3 top-20 z-40 lg:hidden">
          <aside className="surface-soft flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-white/96">
            <div className="flex items-center justify-between border-b border-orange-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                  <Bot className="size-5" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-stone-950">AI 智能助手</h2>
                  <p className="text-xs text-stone-500">{scopeLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex size-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-orange-50 hover:text-orange-700"
                aria-label="关闭 AI 智能助手"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-3">
              {renderQuickIntents()}
              {renderMessages(mobileMessagesEndRef, true)}
              {renderComposer()}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
