import React, { createContext, useContext, useState, useCallback } from 'react';

interface StaffData {
  staffId: string;
  staffName: string;
  role: string;
  branchId: string;
  tenantId: string;
}

interface WaitersContextType extends StaffData {
  isLoggedIn: boolean;
  login: (staff: StaffData) => void;
  logout: () => void;
}

const defaultValue: WaitersContextType = {
  staffId: '',
  staffName: '',
  role: '',
  branchId: '',
  tenantId: '',
  isLoggedIn: false,
  login: () => {},
  logout: () => {},
};

const WaitersContext = createContext<WaitersContextType>(defaultValue);

export const useWaiters = () => useContext(WaitersContext);

export const WaitersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [staff, setStaff] = useState<StaffData | null>(() => {
    const saved = sessionStorage.getItem('mozo_staff');
    return saved ? JSON.parse(saved) : null;
  });

  const login = useCallback((data: StaffData) => {
    setStaff(data);
    sessionStorage.setItem('mozo_staff', JSON.stringify(data));
  }, []);

  const logout = useCallback(() => {
    setStaff(null);
    sessionStorage.removeItem('mozo_staff');
  }, []);

  const value: WaitersContextType = {
    staffId: staff?.staffId ?? '',
    staffName: staff?.staffName ?? '',
    role: staff?.role ?? '',
    branchId: staff?.branchId ?? '',
    tenantId: staff?.tenantId ?? '',
    isLoggedIn: !!staff,
    login,
    logout,
  };

  return <WaitersContext.Provider value={value}>{children}</WaitersContext.Provider>;
};
