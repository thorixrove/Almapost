// Ditampilkan seketika saat berpindah ke /dashboard atau /workspaces,
// sementara data halaman masih dimuat di server.
export default function MainLoading() {
  return (
    <div className="w-full flex-1 px-6 py-8 md:px-12" aria-busy="true" aria-label="Memuat halaman">
      <div className="mx-auto w-full max-w-400 animate-pulse">
        <div className="mb-8 h-28 rounded-2xl bg-white/5" />

        <div className="mb-4 flex items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-white/5" />
            <div className="h-5 w-44 rounded bg-white/10" />
          </div>
          <div className="h-8 w-36 rounded-md bg-white/5" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl border border-white/6 bg-white/3" />
          ))}
        </div>
      </div>
    </div>
  );
}