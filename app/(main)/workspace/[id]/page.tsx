import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Block } from "@blocknote/core";
import type { TLEditorSnapshot } from "tldraw";
import { prisma } from "@/lib/prisma";
import { canAccessWorkspace } from "@/lib/workspace-access";
import { Button } from "@/components/ui/button";
import { PlanButton } from "@/components/PlanButton";
import { getEntitlements, workspaceOwnerId, workspaceOwnerSelect } from "@/lib/billing";
import { WorkspaceEditorsProvider } from "@/components/WorkspaceEditorsContext";
import { DocEditor } from "@/components/DocEditorLoader";
import { EditableWorkspaceName } from "./_components/EditableWorkspaceName";
import { CanvasEditor } from "./_components/CanvasEditorLoader"
import { AgentToggleButton } from "./_components/AgentToggleButton";
import { ShareDialog } from "./_components/ShareDialog";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { VersionHistoryDialog } from "./_components/VersionHistoryDialog"

type ViewMode = "doc" | "canvas" | "both";

function parseViewMode(value: string | string[] | undefined): ViewMode {
    return value === "doc" || value === "canvas" ? value : "both";
}

// Versi sementara Langkah 10: dokumen + canvas + agen. Tombol Share ditambahkan di langkah berikutnya,
// lalu file ini diganti.

export default async function WorkspacePage({ params, searchParams }: PageProps<"/workspace/[id]">) {
    const { id } = await params;
    const { view: viewParam, prompt } = await searchParams;
    const view = parseViewMode(viewParam);

    const [hasAccess, workspace] = await Promise.all([
        canAccessWorkspace(id),
        prisma.workspace.findUnique({
            where: { id },
            select: {
                name: true,
                shareToken: true,
                ...workspaceOwnerSelect,
                doc: { select: { content: true, yjsState: true } },
                canvas: { select: { content: true } }
            },
        }),
    ])

    if (!hasAccess || !workspace) notFound()


    const entitlements = await getEntitlements(workspaceOwnerId(workspace))

    const showDoc = view === "doc" || view === "both";
    const showCanvas = view === "canvas" || view === "both";

    return (
        <WorkspaceEditorsProvider>
            <div className="flex h-dvh flex-col overflow-hidden">
                <header className="flex h-14 shrink-0 items-center border-b border-white/6 bg-background px-4">
                    <div className="flex flex-1 items-center gap-3">
                        <Link
                            href="/dashboard"
                            aria-label="Kembali ke dashboard"
                            className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-accent"
                        >
                            <ArrowLeft className="size-4" />
                        </Link>
                        <EditableWorkspaceName workspaceId={id} initialName={workspace.name} />
                    </div>

                    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/3 p-1">
                        {(["doc", "both", "canvas"] as const).map((mode) => (
                            <Button
                                key={mode}
                                asChild
                                variant={view === mode ? "secondary" : "ghost"}
                                size="sm"
                                className="capitalize"
                            >
                                <Link href={mode === "both" ? `/workspace/${id}` : `/workspace/${id}?view=${mode}`}>
                                    {mode === "doc" ? "Document" : mode}
                                </Link>
                            </Button>
                        ))}
                    </div>

                    <div className="flex flex-1 items-center justify-end gap-2">
                        <PlanButton upgradeOnlyWhenOut />
                        <VersionHistoryDialog workspaceId={id} />
                        <ShareDialog
                            workspaceId={id}
                            workspaceName={workspace.name}
                            initialShareToken={workspace.shareToken}
                            canShare={entitlements.publicSharing}
                            canExportPdf={entitlements.pdfExport}
                        />
                        <AgentToggleButton workspaceId={id} initialPrompt={typeof prompt === "string" ? prompt : undefined} />
                    </div>
                </header>

                {/* key gives each view a fresh panel group, so an old layout isn't applied to new panels */}
                <ResizablePanelGroup key={view} orientation="horizontal" className="flex-1">
                    {showDoc && (
                        <ResizablePanel defaultSize={35} minSize={20}>
                            <DocEditor
                                key={id}
                                workspaceId={id}
                                initialContent={workspace.doc?.content as Block[] | null}
                                initialState={
                                    workspace.doc?.yjsState ? Buffer.from(workspace.doc.yjsState).toString("base64") : null
                                }
                            />
                        </ResizablePanel>
                    )}
                    {showDoc && showCanvas && <ResizableHandle withHandle />}
                    {showCanvas && (
                        <ResizablePanel defaultSize={75} minSize={20}>
                            <CanvasEditor
                                workspaceId={id}
                                initialSnapshot={workspace.canvas?.content as TLEditorSnapshot | null}
                            />
                        </ResizablePanel>
                    )}
                </ResizablePanelGroup>
            </div>
        </WorkspaceEditorsProvider>
    );
}