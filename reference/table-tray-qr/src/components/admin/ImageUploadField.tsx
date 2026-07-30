import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, X } from "lucide-react";

interface ImageUploadFieldProps {
  label: string;
  value: string;
  tenantId: string;
  bucket?: string;
  folder?: string;
  onChange: (url: string) => void;
}

export default function ImageUploadField({ label, value, tenantId, bucket = "menu-images", folder = "branding", onChange }: ImageUploadFieldProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"].includes(file.type)) {
      toast({ title: "Formato no válido", description: "Solo JPG, PNG, WEBP, GIF o SVG", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Archivo muy grande", description: "Máximo 5MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const filename = `${tenantId}/${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

    const { data, error } = await supabase.storage.from(bucket).upload(filename, file, { cacheControl: "3600", upsert: false });

    if (error) {
      toast({ title: "Error al subir imagen", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);
    onChange(publicUrl);
    setUploading(false);
    toast({ title: "Imagen subida" });
  };

  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {value ? (
        <div className="relative w-full h-32 rounded-lg overflow-hidden bg-muted mb-2">
          <img src={value} alt={label} className="w-full h-full object-contain" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors mb-2">
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
          {uploading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
              <span className="text-sm">Subiendo...</span>
            </div>
          ) : (
            <>
              <Upload className="h-6 w-6 text-muted-foreground mb-1" />
              <span className="text-xs text-muted-foreground">Click para subir imagen</span>
            </>
          )}
        </label>
      )}
      <Input
        placeholder="O pegar URL de imagen..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs"
      />
    </div>
  );
}
