-- Jalankan sekali di Supabase Dashboard > SQL Editor.
-- Membuat bucket PRIVATE untuk gambar canvas. Batas ukuran dan tipe file dipaksa oleh Supabase
-- sendiri, jadi tetap berlaku walau klien mengirim data yang berbeda dari yang dia klaim.
--
-- Tidak ada policy RLS yang ditambahkan, dan itu disengaja: tanpa policy, klien dengan kunci
-- publishable tidak bisa membaca atau menulis apa pun. Upload memakai signed upload URL dari
-- server, pembacaan lewat /api/assets, dan keduanya memakai SUPABASE_SECRET_KEY di server.
--
-- Nilai file_size_limit harus sama dengan MAX_ASSET_BYTES di lib/asset-config.ts (5 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workspace-assets',
  'workspace-assets',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;