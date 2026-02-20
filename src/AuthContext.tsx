import { createContext, useContext, useState, ReactNode } from 'react';

type UserRole = 'admin' | 'employee' | null;

interface AuthState {
    role: UserRole;
    employeeId?: string;
    login: (role: UserRole, id?: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [role, setRole] = useState<UserRole>(null);
    const [employeeId, setEmployeeId] = useState<string | undefined>(undefined);

    const login = (newRole: UserRole, newId?: string) => {
        setRole(newRole);
        setEmployeeId(newId);
    };

    const logout = () => {
        setRole(null);
        setEmployeeId(undefined);
    };

    return (
        <AuthContext.Provider value={{ role, employeeId, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
