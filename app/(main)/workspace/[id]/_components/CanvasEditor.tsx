"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";
import {
  Tldraw,
  atom,
  computed,
  createTLCurrentUser,
  createUserId,
  getUserPreferences,
  UserRecordType,
  DefaultToolbar,
  DefaultToolbarContent,
  inlineBase64AssetStore,
  defaultShapeUtils,
  defaultBindingUtils,
  type Editor,
  type TLEditorSnapshot,
  type TLComponents,
} from "tldraw";
import { useSync, useSyncDemo } from "@tldraw/sync";
import "tldraw/tldraw.css";
import { saveCanvasContent } from "@/actions/canvas";
import type { Prisma } from "@/lib/generated/prisma/client";
import { EntityTableShapeUtil } from "@/components/EntityTable/EntityTableShapeUtil";
import { AddEntityTableButton } from "@/components/EntityTable/AddEntityTableButton";
import { snapArrowBindingToRow } from "@/components/EntityTable/snapArrowToRow";
import { useWorkspaceEditors } from "@/components/WorkspaceEditorsContext";
import { useWorkspaceRole } from "@/components/WorkspaceRoleContext";
import { colorForUser } from "@/lib/utils";

const SAVE_DEBOUNCE_MS = 1000;

const shapeUtils = [EntityTableShapeUtil];

// Our own sync server (the tldraw-sync/ Cloudflare Worker). Without it, tldraw's public demo
// server is used: fine for trying things out, but rooms there are public and get wiped.
const SYNC_URL = process.env.NEXT_PUBLIC_TLDRAW_SYNC_URL;

// Unlike useSyncDemo, useSync doesn't add tldraw's built-in shapes itself. Built once here:
// a new array on every render would make useSync rebuild the store in a loop.
const syncShapeUtils = [...defaultShapeUtils, ...shapeUtils];

type SyncOptions = { roomId: string; users?: Parameters<typeof useSyncDemo>[0]["users"] };

// Chosen once at load, so it's always the same hook. Images are stored inside the room.
const useCanvasSync = SYNC_URL
  ? ({ roomId, users }: SyncOptions) =>
      useSync({
        uri: `${SYNC_URL}/connect/${roomId}`,
        assets: inlineBase64AssetStore,
        shapeUtils: syncShapeUtils,
        bindingUtils: defaultBindingUtils,
        users,
      })
  : ({ roomId, users }: SyncOptions) => useSyncDemo({ roomId, shapeUtils, users });

// A cleaner, single-page canvas: no style panel, page menu or main menu, and a vertical toolbar
// on the left with our Add table button.
const components: TLComponents = {
  StylePanel: null,
  PageMenu: null,
  MainMenu: null,
  Toolbar: () => (
    <DefaultToolbar orientation="vertical">
      <AddEntityTableButton />
      <DefaultToolbarContent />
    </DefaultToolbar>
  ),
};

const SYNC_TIMEOUT_MS = 8000;

// Logika bersama: identitas pengguna, autosave ke Postgres, dan snap panah ke baris tabel.
function useCanvasShared(workspaceId: string, initialSnapshot: TLEditorSnapshot | null) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setCanvasEditor } = useWorkspaceEditors();
  const { user } = useUser();

  // Gives other collaborators this user's real name/avatar on their cursor instead of "New User".
  // Memoized on primitives because useSync reconnects whenever the users object changes.
  const userId = user?.id;
  const userName = user?.fullName ?? user?.username ?? "Anonymous";
  const userImageUrl = user?.imageUrl ?? "";
  const users = useMemo(() => {
    if (!userId) return undefined;
    return {
      currentUser: atom(
        "currentUser",
        UserRecordType.create({
          id: createUserId(userId),
          name: userName,
          color: colorForUser(userId),
          imageUrl: userImageUrl,
        })
      ),
    };
  }, [userId, userName, userImageUrl]);

  // The editor's own identity (people menu, your own cursor) is separate from what gets synced.
  const currentUser = useMemo(() => {
    if (!userId) return undefined;
    return createTLCurrentUser({
      userPreferences: computed("clerkUserPreferences", () => ({
        ...getUserPreferences(),
        id: userId,
        name: userName,
        color: colorForUser(userId),
      })),
    });
  }, [userId, userName]);

  const handleMount = (editor: Editor) => {
    setCanvasEditor(editor);
    // Seed from Postgres only when the canvas is empty, so a joining user doesn't overwrite
    // what others have already drawn.
    if (initialSnapshot && editor.getCurrentPageShapeIds().size === 0) {
      editor.loadSnapshot(initialSnapshot);
    }

    editor.store.listen(
      () => {
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
          // Round-tripping through JSON strips non-plain internals so the Server Action accepts it.
          const plainSnapshot = JSON.parse(JSON.stringify(editor.getSnapshot())) as Prisma.InputJsonValue;
          saveCanvasContent(workspaceId, plainSnapshot);
        }, SAVE_DEBOUNCE_MS);
      },
      { source: "user", scope: "document" }
    );

    // Arrows drawn onto an ERD table snap to the nearest row (see snapArrowToRow.ts).
    editor.store.listen(
      (entry) => {
        for (const record of Object.values(entry.changes.added)) {
          if (record.typeName === "binding" && record.type === "arrow") {
            snapArrowBindingToRow(editor, record);
          }
        }
      },
      { source: "user", scope: "all" }
    );

    // Clear it on unmount (e.g. switching to the Document view) so nothing keeps a disposed editor.
    return () => setCanvasEditor(null);
  };

  return { users, currentUser, handleMount };
}

// Mode kolaborasi: tersambung ke server sinkronisasi. Kalau gagal atau terlalu lama, panggil onFail.
function SyncedCanvas({
  workspaceId,
  initialSnapshot,
  onFail,
}: {
  workspaceId: string;
  initialSnapshot: TLEditorSnapshot | null;
  onFail: () => void;
}) {
  const { users, currentUser, handleMount } = useCanvasShared(workspaceId, initialSnapshot);
  const store = useCanvasSync({ roomId: `almapost-${workspaceId}`, users });

  useEffect(() => {
    if (store.status === "error") {
      onFail();
      return;
    }
    if (store.status === "loading") {
      const timer = setTimeout(onFail, SYNC_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
  }, [store.status, onFail]);

  if (store.status === "loading" || store.status === "error") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Menghubungkan ke server canvas...
      </div>
    );
  }

  return (
    // isolate keeps tldraw's high z-index layers inside the canvas, so dialogs render above them.
    <div className="isolate h-full [&_.tlui-main-toolbar--vertical]:top-4!">
      <Tldraw
        store={store}
        user={currentUser}
        onMount={handleMount}
        components={components}
        colorScheme="dark"
        shapeUtils={shapeUtils}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
    </div>
  );
}

// Mode lokal (cadangan): tanpa server sinkronisasi. Isi canvas dimuat dari Postgres dan
// tetap tersimpan otomatis, hanya kolaborasi langsung yang tidak aktif.
function LocalCanvas({
  workspaceId,
  initialSnapshot,
}: {
  workspaceId: string;
  initialSnapshot: TLEditorSnapshot | null;
}) {
  const { currentUser, handleMount } = useCanvasShared(workspaceId, initialSnapshot);

  return (
    <div className="isolate h-full [&_.tlui-main-toolbar--vertical]:top-4!">
      <Tldraw
        user={currentUser}
        onMount={handleMount}
        components={components}
        colorScheme="dark"
        shapeUtils={shapeUtils}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
    </div>
  );
}

export function CanvasEditor({
  workspaceId,
  initialSnapshot,
}: {
  workspaceId: string;
  initialSnapshot: TLEditorSnapshot | null;
}) {
  const [useLocal, setUseLocal] = useState(false);

  const handleSyncFail = useCallback(() => {
    setUseLocal(true);
    toast.info("Server canvas tidak terjangkau. Canvas berjalan dalam mode lokal tanpa kolaborasi langsung.");
  }, []);

  return useLocal ? (
    <LocalCanvas workspaceId={workspaceId} initialSnapshot={initialSnapshot} />
  ) : (
    <SyncedCanvas workspaceId={workspaceId} initialSnapshot={initialSnapshot} onFail={handleSyncFail} />
  );
}