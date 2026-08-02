import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Employee, SessionUser } from '@haeppi/shared';
import { ApiError, api } from './client';

export const queryKeys = {
  me: ['auth', 'me'] as const,
  employees: ['employees'] as const,
};

export function useSession() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<SessionUser | null> => {
      try {
        const { user } = await api<{ user: SessionUser }>('/auth/me');
        return user;
      } catch (error) {
        // 401 heisst "nicht angemeldet" - das ist ein gueltiger Zustand,
        // kein Fehler, der eine Fehlerseite rechtfertigt.
        if (error instanceof ApiError && error.isUnauthorized) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 30_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) =>
      api<{ user: SessionUser }>('/auth/login', { method: 'POST', body: credentials }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(queryKeys.me, user);
      void queryClient.invalidateQueries();
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.me, null);
      queryClient.clear();
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api<{ ok: boolean; reloginRequired: boolean }>('/auth/password', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      // Der Server beendet beim Wechsel alle Sitzungen - auch diese.
      queryClient.setQueryData(queryKeys.me, null);
      queryClient.clear();
    },
  });
}

export function useEmployees() {
  return useQuery({
    queryKey: queryKeys.employees,
    queryFn: async () => {
      const { employees } = await api<{ employees: Employee[] }>('/employees');
      return employees;
    },
  });
}
