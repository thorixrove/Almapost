// Ditampilkan seketika saat membuka /workspace/[id] (atau ganti tampilan doc/canvas),
// sementara data workspace masih dimuat di server. Bentuknya meniru header + dua panel.
export default function WorkspaceLoading() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden" aria-busy="true" aria-label="Memuat workspace">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/6 bg-background px-4">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-md bg-white/5" />
          <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
        </div>
        <div className="h-9 w-56 animate-pulse rounded-lg bg-white/5" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 animate-pulse rounded-full bg-white/5" />
          <div className="h-8 w-20 animate-pulse rounded-md bg-white/5" />
        </div>
      </div>

      <div className="flex flex-1 animate-pulse">
        <div className="w-[35%] space-y-3 border-r border-white/6 p-6">
          <div className="h-6 w-2/3 rounded bg-white/10" />
          <div className="h-3 w-full rounded bg-white/5" />
          <div className="h-3 w-5/6 rounded bg-white/5" />
          <div className="h-3 w-4/6 rounded bg-white/5" />
        </div>
        <div className="flex-1 bg-white/2" />
      </div>
    </div>
  );
}