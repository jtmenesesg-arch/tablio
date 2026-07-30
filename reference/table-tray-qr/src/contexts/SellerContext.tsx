import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SellerProfile {
  id: string;
  name: string;
  email: string;
  zone: string | null;
  role: string;
  avatar_url: string | null;
  phone: string | null;
}

interface SellerContextType {
  seller: SellerProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  impersonatingId: string | null;
}

const SellerContext = createContext<SellerContextType>({
  seller: null,
  isLoading: true,
  isAuthenticated: false,
  isPlatformAdmin: false,
  impersonatingId: null,
});

export const useSeller = () => useContext(SellerContext);

export const SellerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  // Check if superadmin is impersonating
  const impersonatingId = sessionStorage.getItem('superadmin_impersonating');

  useEffect(() => {
    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setSeller(null);
          setIsLoading(false);
          return;
        }

        // Check platform admin
        const { data: pa } = await supabase.from('platform_admins').select('id').eq('user_id', session.user.id).maybeSingle();
        setIsPlatformAdmin(!!pa);

        // If impersonating, load that member's profile
        if (impersonatingId && pa) {
          const { data: impData } = await supabase
            .from('backoffice_members')
            .select('id, name, email, zone, role, avatar_url, phone')
            .eq('id', impersonatingId)
            .maybeSingle();
          if (impData) {
            setSeller(impData as SellerProfile);
            setIsLoading(false);
            return;
          }
        }

        const { data, error } = await supabase
          .from('backoffice_members')
          .select('id, name, email, zone, role, avatar_url, phone')
          .eq('user_id', session.user.id)
          .eq('is_active', true)
          .maybeSingle();

        if (error) {
          console.warn('SellerContext: Error querying backoffice_members', error.message);
        }

        setSeller(data as SellerProfile | null);
        setIsLoading(false);
      } catch (err) {
        console.error('SellerContext: Unexpected error', err);
        setIsLoading(false);
      }
    };
    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      check();
    });
    return () => subscription.unsubscribe();
  }, [impersonatingId]);

  return (
    <SellerContext.Provider value={{ seller, isLoading, isAuthenticated: !!seller || isPlatformAdmin, isPlatformAdmin, impersonatingId }}>
      {children}
    </SellerContext.Provider>
  );
};
