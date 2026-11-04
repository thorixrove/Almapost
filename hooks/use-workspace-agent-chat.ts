"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import type { Editor } from "tldraw";
import type { BlockNoteEditor } from "@blocknote/core";
import { agentToolDefs, docToolDefs, fail, type ToolResult } from "@/lib/agent-tools";
import { PROMPT_LIMIT_ERROR, UPGRADE_REASONS } from "@/lib/plan-limits";
import { executeCanvasTool, summarizeCanvas, type ShapeIdMap } from "@/lib/agent-canvas";
import { executeDocTool, summarizeDoc } from "@/lib/agent-doc";
import { refreshPromptUsage } from "@/components/PlanButton";
import { useUpgradeDialog } from "@/components/UpgradeDialog";
import { toast } from "sonner";
import {
  captureSurfaces,
  hasChanges,
  isPartialRestore,
  restoreSurfaces,
  revealChanges,
  summarizeTurn,
  type SurfaceSnapshot,
  type TurnSummary,
} from "@/lib/agent-turn";

type Editors = { canvasEditor: Editor | null; docEditor: BlockNoteEditor | null };

// Every call must produce an output (even a failure), or the chat waits on it forever.
function runTool({ canvasEditor, docEditor }: Editors, idMap: ShapeIdMap, toolName: string, input: unknown): ToolResult {
  try {
    if (toolName in docToolDefs) {
      return docEditor
        ? executeDocTool(docEditor, toolName, input)
        : fail("The doc isn't open in this view. Tell the user to switch to the Both or Document view.");
    }
    return canvasEditor
      ? executeCanvasTool(canvasEditor, idMap, toolName, input)
      : fail("The canvas isn't open in this view. Tell the user to switch to the Both or Canvas view.");
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Tool failed");
  }
}

type LastTurn = {
  summary: TurnSummary
  before: SurfaceSnapshot
  redo: SurfaceSnapshot | null
}

export function useWorkspaceAgentChat(workspaceId: string, editors: Editors) {
  const idMap = useRef<ShapeIdMap>(new Map());
  const turnRef = useRef<{ before: SurfaceSnapshot } | null>(null)
  const [lastTurn, setLastTurn] = useState<LastTurn | null>(null)
  const openUpgrade = useUpgradeDialog();
  const editorsRef = useRef(editors);


  useEffect(() => {
    editorsRef.current = editors;
  });

  // Built once, so it reads the latest editors on each request: every request (including the
  // automatic follow-ups after tool calls) carries the current state of both surfaces.
  const [transport] = useState(
    // The ref is only read when a request is sent, never during render.
    // eslint-disable-next-line react-hooks/refs
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        body: () => {
          const { canvasEditor, docEditor } = editorsRef.current;
          return {
            workspaceId,
            canvasContext: canvasEditor ? summarizeCanvas(canvasEditor) : null,
            docContext: docEditor ? summarizeDoc(docEditor) : null,
          };
        },
      })
  );

  const finishTurn = ({
    messages,
    isAbort,
    isDisconnect,
    isError
  }: {
    messages: Parameters<typeof lastAssistantMessageIsCompleteWithToolCalls>[0]["messages"]
    isAbort: boolean
    isDisconnect: boolean
    isError: boolean
  }) => {
    const turn = turnRef.current
    if (!turn) return
    const interupted = isAbort || isDisconnect || isError
    if (!interupted && lastAssistantMessageIsCompleteWithToolCalls({ messages })) return

    turnRef.current = null
    const summary = summarizeTurn(turn.before, captureSurfaces(editorsRef.current))
    if (hasChanges(summary)) setLastTurn({ summary, before: turn.before, redo: null })
  }

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: (event) => {
      refreshPromptUsage()
      finishTurn(event)
    },
    onError: (error) => {
      if (!error.message.includes(PROMPT_LIMIT_ERROR)) return;
      refreshPromptUsage();
      openUpgrade(UPGRADE_REASONS.prompts);
    },
    onToolCall: ({ toolCall }) => {
      const output = runTool(editorsRef.current, idMap.current, toolCall.toolName, toolCall.input);
      // Not awaited: the SDK checks for the automatic resubmit right after this callback returns.
      chat.addToolOutput({
        tool: toolCall.toolName as keyof typeof agentToolDefs,
        toolCallId: toolCall.toolCallId,
        output,
      });
    },
  });

  const sendMessage: typeof chat.sendMessage = (...args) => {
    turnRef.current = { before: captureSurfaces(editorsRef.current) }
    setLastTurn(null)
    return chat.sendMessage(...args)
  }

  const undoAgentTurn = () => {
    if (!lastTurn) return
    const redo = captureSurfaces(editorsRef.current)
    const restored = restoreSurfaces(editorsRef.current, lastTurn.before)
    if (isPartialRestore(lastTurn.before, restored)) {

      toast.info("Only the open view was reverted. Switch to the Both view and undo again for the rest.")
      return
    }
    setLastTurn({ ...lastTurn, redo })
  }

  const redoAgentTurn = () => {
    if (!lastTurn?.redo) return
    restoreSurfaces(editorsRef.current, lastTurn.redo)
    setLastTurn({ ...lastTurn, redo: null })
  }

  const showAgentChanges = () => {
    if (lastTurn) revealChanges(editorsRef.current, lastTurn.summary)
  }

  return {
    ...chat,
    sendMessage,
    agentTurn: lastTurn ? { summary: lastTurn.summary, undone: lastTurn.redo !== null } : null,
    undoAgentTurn,
    redoAgentTurn,
    showAgentChanges,
  }
}

export type WorkspaceAgentChat = ReturnType<typeof useWorkspaceAgentChat>;