import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SuperAdminContextType {
  isPlatformAdmin: boolean;
  isLoading: boolean;
  impersonating: string | null;
  setImpersonating: (id: string | null) => void;
}

const SuperAdminContext = createContext<SuperAdminContextType>({
  isPlatformAdmin: false,
  isLoading: true,
  impersonating: null,
  setImpersonating: () => {},
});

export const useSuperAdmin = () => useContext(SuperAdminContext);

export const SuperAdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [impersonating, setImpersonatingState] = useState<string | null>(
    () => sessionStorage.getItem('superadmin_impersonating')
  );

  const setImpersonating = (id: string | null) => {
    setImpersonatingState(id);
    if (id) {
      sessionStorage.setItem('superadmin_impersonating', id);
    } else {
      sessionStorage.removeItem('superadmin_impersonating');
    }
  };

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsPlatformAdmin(false);
        setIsLoading(false);
        return;
      }
      const { data } = await supabase
        .from('platform_admins')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      setIsPlatformAdmin(!!data);
      setIsLoading(false);
    };
    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      check();
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <SuperAdminContext.Provider value={{ isPlatformAdmin, isLoading, impersonating, setImpersonating }}>
      {children}
    </SuperAdminContext.Provider>
  );
};
