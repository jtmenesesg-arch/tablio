import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useJefeVentas } from '@/contexts/JefeVentasContext';
import { toast } from 'sonner';
import { Loader2, Save, KeyRound } from 'lucide-react';

export default function JVPerfilPage() {
  const { profile } = useJefeVentas();
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);

  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  const savePerfil = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('backoffice_members').update({ name, phone: phone || null }).eq('id', profile.id);
    if (error) toast.error(error.message);
    else toast.success('Perfil actualizado');
    setSaving(false);
  };

  const changePassword = async () => {
    if (newPass.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return; }
    if (newPass !== confirmPass) { toast.error('Las contraseñas no coinciden'); return; }
    setChangingPass(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) toast.error(error.message);
    else {
      toast.success('Contraseña actualizada');
      setCurrentPass(''); setNewPass(''); setConfirmPass('');
    }
    setChangingPass(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-foreground">Mi perfil</h1>

      <Card>
        <CardHeader><CardTitle className="text-sm">Información personal</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Teléfono</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+56..." />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={profile?.email || ''} disabled className="opacity-50" />
          </div>
          <Button onClick={savePerfil} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><KeyRound className="w-4 h-4" />Cambiar contraseña</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nueva contraseña</Label>
            <Input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>
          <div className="space-y-2">
            <Label>Confirmar contraseña</Label>
            <Input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} />
          </div>
          <Button onClick={changePassword} disabled={changingPass} variant="outline" className="gap-2">
            {changingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Cambiar contraseña
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
