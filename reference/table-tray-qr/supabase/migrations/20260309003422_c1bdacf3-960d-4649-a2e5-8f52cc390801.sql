-- Create storage bucket for menu item images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('menu-images', 'menu-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

-- RLS policies for menu-images bucket
-- Allow public read access
CREATE POLICY "menu_images_public_read" ON storage.objects FOR SELECT
USING (bucket_id = 'menu-images');

-- Allow authenticated tenant members to upload
CREATE POLICY "menu_images_tenant_upload" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'menu-images' AND
  (storage.foldername(name))[1] = get_tenant_id()::text
);

-- Allow tenant members to update their own images
CREATE POLICY "menu_images_tenant_update" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'menu-images' AND
  (storage.foldername(name))[1] = get_tenant_id()::text
);

-- Allow tenant members to delete their own images
CREATE POLICY "menu_images_tenant_delete" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'menu-images' AND
  (storage.foldername(name))[1] = get_tenant_id()::text
);