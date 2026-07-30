import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface JefeVentasProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
}

interface JefeVentasContextType {
  profile: JefeVentasProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  impersonatingId: string | null;
  setImpersonatingId: (id: string | null) => void;
  effectiveUserId: string | null;
}

const JefeVentasContext = createContext<JefeVentasContextType>({
  profile: null,
  isLoading: true,
  isAuthenticated: false,
  isPlatformAdmin: false,
  impersonatingId: null,
  setImpersonatingId: () => {},
  effectiveUserId: null,
});

export const useJefeVentas = () => useContext(JefeVentasContext);

export const JefeVentasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<JefeVentasProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [impersonatingId, setImpersonatingIdState] = useState<string | null>(
    () => sessionStorage.getItem('jv_impersonating')
  );

  const setImpersonatingId = (id: string | null) => {
    setImpersonatingIdState(id);
    if (id) {
      sessionStorage.setItem('jv_impersonating', id);
    } else {
      sessionStorage.removeItem('jv_impersonating');
    }
  };

  useEffect(() => {
    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setProfile(null); setIsLoading(false); return; }

        // Check platform admin
        const { data: pa } = await supabase.from('platform_admins').select('id').eq('user_id', session.user.id).maybeSingle();
        setIsPlatformAdmin(!!pa);

        // Check backoffice member with jefe_ventas role
        const { data, error } = await supabase
          .from('backoffice_members')
          .select('id, name, email, phone, avatar_url, role')
          .eq('user_id', session.user.id)
          .eq('is_active', true)
          .maybeSingle();

        if (error) {
          console.warn('JefeVentasContext: Error querying backoffice_members', error.message);
          // Fallback: if platform admin, allow access
          if (pa) {
            setProfile({ id: 'admin', name: 'Admin', email: session.user.email || '', phone: null, avatar_url: null, role: 'superadmin' });
          }
          setIsLoading(false);
          return;
        }

        if (data && (data.role === 'jefe_ventas' || !!pa)) {
          setProfile(data as JefeVentasProfile);
        }
        setIsLoading(false);
      } catch (err) {
        console.error('JefeVentasContext: Unexpected error', err);
        setIsLoading(false);
      }
    };
    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => check());
    return () => subscription.unsubscribe();
  }, []);

  const effectiveUserId = impersonatingId || profile?.id || null;

  return (
    <JefeVentasContext.Provider value={{ profile, isLoading, isAuthenticated: !!profile || isPlatformAdmin, isPlatformAdmin, impersonatingId, setImpersonatingId, effectiveUserId }}>
      {children}
    </JefeVentasContext.Provider>
  );
};
