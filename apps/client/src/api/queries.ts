import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Absence,
  AbsenceType,
  Assignment,
  DayBlock,
  Diagnostic,
  Employee,
  HolidaySettings,
  MatrixEntry,
  PlanKind,
  PlannedAssignment,
  PublicAbsence,
  SessionUser,
  Skill,
  TemplateAssignment,
  VacationBalance,
  WorkArea,
} from '@haeppi/shared';
import { ApiError, api } from './client';

export const queryKeys = {
  me: ['auth', 'me'] as const,
  employees: ['employees'] as const,
  workAreas: ['work-areas'] as const,
  skills: ['skills'] as const,
  dayBlocks: ['day-blocks'] as const,
  settings: ['settings'] as const,
  matrix: ['matrix'] as const,
};

export interface PracticeSettings {
  practiceName: string;
  holidays: HolidaySettings;
  minOverlapRatio: number;
  fairnessWeeks: number;
}

// ------------------------------------------------------------------ Auth --

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

// ------------------------------------------------------------ Stammdaten --

export function useEmployees(includeInactive = false) {
  return useQuery({
    queryKey: [...queryKeys.employees, includeInactive],
    queryFn: async () => {
      const { employees } = await api<{ employees: Employee[] }>(
        includeInactive ? '/employees?includeInactive=1' : '/employees',
      );
      return employees;
    },
  });
}

export type EmployeeInput = Omit<Employee, 'id' | 'version'>;

export function useSaveEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      version,
      input,
    }: {
      id?: string;
      version?: number;
      input: EmployeeInput;
    }) =>
      id
        ? api<{ employee: Employee }>(`/employees/${id}`, {
            method: 'PUT',
            body: input,
            // Optimistische Sperre: hat inzwischen jemand anders
            // gespeichert, antwortet der Server mit 409 statt zu ueberschreiben.
            ...(version === undefined ? {} : { ifMatch: version }),
          })
        : api<{ employee: Employee }>('/employees', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.employees });
    },
  });
}

export function useDeactivateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/employees/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.employees });
    },
  });
}

export function useWorkAreas(includeInactive = false) {
  return useQuery({
    queryKey: [...queryKeys.workAreas, includeInactive],
    queryFn: async () => {
      const { workAreas } = await api<{ workAreas: WorkArea[] }>(
        includeInactive ? '/work-areas?includeInactive=1' : '/work-areas',
      );
      return workAreas;
    },
  });
}

export type WorkAreaInput = Omit<WorkArea, 'id'>;

export function useSaveWorkArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: WorkAreaInput }) =>
      id
        ? api<{ workArea: WorkArea }>(`/work-areas/${id}`, { method: 'PUT', body: input })
        : api<{ workArea: WorkArea }>('/work-areas', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workAreas });
    },
  });
}

export function useDeleteWorkArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      api<void>(`/work-areas/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workAreas });
    },
  });
}

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: async () => (await api<{ skills: Skill[] }>('/skills')).skills,
  });
}

export type SkillInput = Omit<Skill, 'id'>;

export function useSaveSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SkillInput }) =>
      id
        ? api<{ skill: Skill }>(`/skills/${id}`, { method: 'PUT', body: input })
        : api<{ skill: Skill }>('/skills', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.skills });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workAreas });
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      api<void>(`/skills/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.skills });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workAreas });
    },
  });
}

export function useDayBlocks() {
  return useQuery({
    queryKey: queryKeys.dayBlocks,
    queryFn: async () => (await api<{ dayBlocks: DayBlock[] }>('/day-blocks')).dayBlocks,
  });
}

export function useSaveDayBlocks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ blocks, force }: { blocks: Omit<DayBlock, 'id'>[]; force?: boolean }) =>
      api<{ dayBlocks: DayBlock[] }>(`/day-blocks${force ? '?force=1' : ''}`, {
        method: 'PUT',
        body: { blocks },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dayBlocks });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workAreas });
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: async () => (await api<{ settings: PracticeSettings }>('/settings')).settings,
  });
}

export function useSaveHolidaySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (holidays: HolidaySettings) =>
      api<{ settings: PracticeSettings }>('/settings/holidays', { method: 'PUT', body: holidays }),
    onSuccess: ({ settings }) => {
      queryClient.setQueryData(queryKeys.settings, settings);
    },
  });
}

// -------------------------------------------------------- Einsatz-Matrix --

export function useMatrix() {
  return useQuery({
    queryKey: queryKeys.matrix,
    queryFn: async () => (await api<{ entries: MatrixEntry[] }>('/matrix')).entries,
  });
}

export type MatrixEntryInput = Omit<MatrixEntry, 'employeeId'>;

// ------------------------------------------------------------ Dienstplan --

export const rosterKey = (from: string, to: string, plan: PlanKind) =>
  ['roster', from, to, plan] as const;

export function useRoster(from: string, to: string, plan: PlanKind) {
  return useQuery({
    queryKey: rosterKey(from, to, plan),
    queryFn: async () =>
      (await api<{ assignments: Assignment[] }>(`/roster?from=${from}&to=${to}&plan=${plan}`))
        .assignments,
  });
}

export interface GenerateResult {
  weekStart: string;
  plan: PlanKind;
  dryRun: boolean;
  assignments: PlannedAssignment[];
  diagnostics: Diagnostic[];
  score: number;
}

export function useGenerateRoster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { weekStart: string; plan: PlanKind; dryRun?: boolean }) =>
      api<GenerateResult>('/roster/generate', { method: 'POST', body: input }),
    onSuccess: (result) => {
      if (!result.dryRun) void queryClient.invalidateQueries({ queryKey: ['roster'] });
    },
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      date: string;
      dayBlockId: string;
      workAreaId: string;
      employeeId: string;
    }) => api<{ assignment: Assignment }>('/roster/assignments', { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['roster'] }),
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/roster/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['roster'] }),
  });
}

export function useToggleLock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, locked }: { id: string; locked: boolean }) =>
      api<{ assignment: Assignment }>(`/roster/assignments/${id}/lock`, {
        method: 'POST',
        body: { locked },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['roster'] }),
  });
}

export function useTemplate(plan: PlanKind) {
  return useQuery({
    queryKey: ['template', plan],
    queryFn: async () =>
      (await api<{ entries: TemplateAssignment[] }>(`/templates/${plan}`)).entries,
  });
}

export function useSaveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      plan,
      entries,
    }: {
      plan: PlanKind;
      entries: Omit<TemplateAssignment, 'id'>[];
    }) =>
      api<{ entries: TemplateAssignment[] }>(`/templates/${plan}`, {
        method: 'PUT',
        body: { entries },
      }),
    onSuccess: (_result, variables) =>
      void queryClient.invalidateQueries({ queryKey: ['template', variables.plan] }),
  });
}

// --------------------------------------------------------- Abwesenheiten --

export function useAbsences(from: string, to: string) {
  return useQuery({
    queryKey: ['absences', from, to],
    queryFn: async () =>
      (await api<{ absences: (Absence | PublicAbsence)[] }>(`/absences?from=${from}&to=${to}`))
        .absences,
  });
}

export function useOpenRequestCount(enabled: boolean) {
  return useQuery({
    queryKey: ['absences', 'open-requests'],
    queryFn: async () => (await api<{ count: number }>('/absences/open-requests')).count,
    enabled,
  });
}

export function useCreateAbsence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      employeeId: string;
      startDate: string;
      endDate: string;
      type: AbsenceType;
      halfDay?: 'am' | 'pm' | null;
      note?: string;
    }) => api<{ absence: Absence }>('/absences', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['absences'] });
      void queryClient.invalidateQueries({ queryKey: ['vacation'] });
    },
  });
}

export function useDecideAbsence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      api<{ absence: Absence }>(`/absences/${id}/decide`, { method: 'POST', body: { status } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['absences'] }),
  });
}

export function useDeleteAbsence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/absences/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['absences'] });
      void queryClient.invalidateQueries({ queryKey: ['vacation'] });
    },
  });
}

export function useVacationBalance(employeeId: string | null, year: number) {
  return useQuery({
    queryKey: ['vacation', employeeId, year],
    queryFn: async () =>
      api<{
        year: number;
        account: { entitlement: number; carryover: number };
        balance: VacationBalance;
      }>(`/absences/vacation/${employeeId}?year=${year}`),
    enabled: employeeId !== null,
  });
}

export function useSaveMatrixRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, entries }: { employeeId: string; entries: MatrixEntryInput[] }) =>
      api<{ entries: MatrixEntry[] }>(`/employees/${employeeId}/matrix`, {
        method: 'PUT',
        body: { entries },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matrix });
    },
  });
}
