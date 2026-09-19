import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Absence,
  AbsenceType,
  Assignment,
  Closure,
  ClosureDuty,
  ClosurePlan,
  CoverageResult,
  DayBlock,
  Diagnostic,
  Employee,
  HolidaySettings,
  MatrixEntry,
  PlanChange,
  PlanKind,
  PlanMode,
  PlanProposal,
  PlannedAssignment,
  PublicAbsence,
  SchedulerWeights,
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
  template: ['template'] as const,
  closures: ['closures'] as const,
  proposals: ['proposals'] as const,
};

export interface PracticeSettings {
  practiceName: string;
  holidays: HolidaySettings;
  minOverlapRatio: number;
  fairnessWeeks: number;
  weights: SchedulerWeights;
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

/** Ob noch gar kein Konto existiert - dann fuehrt die Oberflaeche durch die Einrichtung. */
export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup', 'status'],
    queryFn: async () => (await api<{ needsSetup: boolean }>('/setup/status')).needsSetup,
    retry: false,
    staleTime: Infinity,
  });
}

export function useCompleteSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { practiceName: string; username: string; password: string }) =>
      api<{ user: SessionUser }>('/setup', { method: 'POST', body: input }),
    onSuccess: ({ user }) => {
      // Der Server meldet direkt an - ein zweites Passwortfeld waere unnoetig.
      queryClient.setQueryData(queryKeys.me, user);
      queryClient.setQueryData(['setup', 'status'], false);
      void queryClient.invalidateQueries();
    },
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
    mutationFn: ({
      plan,
      blocks,
      force,
    }: {
      plan: PlanKind;
      blocks: (Omit<DayBlock, 'id'> & { id?: string })[];
      force?: boolean;
    }) =>
      api<{ dayBlocks: DayBlock[] }>(`/day-blocks/${plan}${force ? '?force=1' : ''}`, {
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

export function useSavePlanningSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      weights: Partial<SchedulerWeights>;
      minOverlapRatio: number;
      fairnessWeeks: number;
    }) => api<{ settings: PracticeSettings }>('/settings/planning', { method: 'PUT', body: input }),
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

// ------------------------------------------------------------ Dienstplan --

export const rosterKey = (from: string, to: string) => ['roster', from, to] as const;

/** Alle Gruppen auf einmal - der Plan ist einer. */
export function useRoster(from: string, to: string) {
  return useQuery({
    queryKey: rosterKey(from, to),
    queryFn: async () =>
      (await api<{ assignments: Assignment[] }>(`/roster?from=${from}&to=${to}`)).assignments,
  });
}

export function useDuties(from: string, to: string) {
  return useQuery({
    queryKey: ['duties', from, to],
    queryFn: async () =>
      (await api<{ duties: ClosureDuty[] }>(`/roster/duties?from=${from}&to=${to}`)).duties,
  });
}

export interface WeekResult {
  weekStart: string;
  assignments: PlannedAssignment[];
  diagnostics: Diagnostic[];
  changes: PlanChange[];
  score: number;
}

export interface GenerateResult {
  weekStart: string;
  weeks: number;
  mode: PlanMode;
  dryRun: boolean;
  results: WeekResult[];
}

export function useGenerateRoster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { weekStart: string; weeks?: number; mode?: PlanMode; dryRun?: boolean }) =>
      api<GenerateResult>('/roster/generate', { method: 'POST', body: input }),
    onSuccess: (result) => {
      if (!result.dryRun) {
        void queryClient.invalidateQueries({ queryKey: ['roster'] });
        void queryClient.invalidateQueries({ queryKey: ['plan-run'] });
        void queryClient.invalidateQueries({ queryKey: queryKeys.proposals });
      }
    },
  });
}

export interface PlanRun {
  id: string;
  weekStart: string;
  mode: string;
  at: string;
  diagnostics: Diagnostic[];
  score: number;
}

export function useLastPlanRun(weekStart: string) {
  return useQuery({
    queryKey: ['plan-run', weekStart],
    queryFn: async () => (await api<{ run: PlanRun | null }>(`/roster/runs/${weekStart}`)).run,
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

// ------------------------------------------------ Umplanungsvorschlaege --

export function useProposals(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.proposals,
    queryFn: async () =>
      api<{ proposals: PlanProposal[]; openCount: number }>('/roster/proposals?status=open'),
    enabled,
  });
}

export function useProposalDetail(id: string | null) {
  return useQuery({
    queryKey: [...queryKeys.proposals, id],
    queryFn: async () =>
      api<{ proposal: PlanProposal; assignments: PlannedAssignment[]; diagnostics: Diagnostic[] }>(
        `/roster/proposals/${id}`,
      ),
    enabled: id !== null,
  });
}

export function useDecideProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'apply' | 'discard' }) =>
      api<{ proposal: PlanProposal }>(`/roster/proposals/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.proposals });
      void queryClient.invalidateQueries({ queryKey: ['roster'] });
      void queryClient.invalidateQueries({ queryKey: ['plan-run'] });
    },
  });
}

// ----------------------------------------------------------- Musterwoche --

export function useTemplate() {
  return useQuery({
    queryKey: queryKeys.template,
    queryFn: async () => (await api<{ entries: TemplateAssignment[] }>('/templates')).entries,
  });
}

export function useSaveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entries: Omit<TemplateAssignment, 'id'>[]) =>
      api<{ entries: TemplateAssignment[] }>('/templates', { method: 'PUT', body: { entries } }),
    onSuccess: ({ entries }) => queryClient.setQueryData(queryKeys.template, entries),
  });
}

export function useTemplateFromWeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (weekStart: string) =>
      api<{ entries: TemplateAssignment[] }>('/templates/from-week', {
        method: 'POST',
        body: { weekStart },
      }),
    onSuccess: ({ entries }) => queryClient.setQueryData(queryKeys.template, entries),
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

/** Antragspruefung: wird es an den Tagen eng? */
export function useAbsenceCheck(employeeId: string, startDate: string, endDate: string) {
  const valid = employeeId !== '' && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && endDate >= startDate;
  return useQuery({
    queryKey: ['absence-check', employeeId, startDate, endDate],
    queryFn: async () =>
      (
        await api<{ check: CoverageResult }>(
          `/absences/check?employeeId=${employeeId}&startDate=${startDate}&endDate=${endDate}`,
        )
      ).check,
    enabled: valid,
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
    }) =>
      api<{ absence: Absence; proposals: PlanProposal[] }>('/absences', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['absences'] });
      void queryClient.invalidateQueries({ queryKey: ['vacation'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.proposals });
    },
  });
}

export function useDecideAbsence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      api<{ absence: Absence; proposals: PlanProposal[] }>(`/absences/${id}/decide`, {
        method: 'POST',
        body: { status },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['absences'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.proposals });
    },
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

// --------------------------------------------------------- Schliesszeiten --

export function useClosures() {
  return useQuery({
    queryKey: queryKeys.closures,
    queryFn: async () => (await api<{ closures: Closure[] }>('/closures')).closures,
  });
}

export type ClosureInput = Omit<Closure, 'id'>;

export function useSaveClosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ClosureInput }) =>
      id
        ? api<{ closure: Closure }>(`/closures/${id}`, { method: 'PUT', body: input })
        : api<{ closure: Closure }>('/closures', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.closures });
    },
  });
}

export function useDeleteClosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/closures/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.closures });
      void queryClient.invalidateQueries({ queryKey: ['duties'] });
    },
  });
}

export function useClosureDuties(closureId: string | null) {
  return useQuery({
    queryKey: ['closure-duties', closureId],
    queryFn: async () =>
      (await api<{ duties: ClosureDuty[] }>(`/closures/${closureId}/duties`)).duties,
    enabled: closureId !== null,
  });
}

export function usePlanClosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dryRun }: { id: string; dryRun: boolean }) =>
      api<{ plan: ClosurePlan; applied: boolean }>(`/closures/${id}/plan`, {
        method: 'POST',
        body: { dryRun },
      }),
    onSuccess: (result) => {
      if (result.applied) {
        void queryClient.invalidateQueries({ queryKey: ['absences'] });
        void queryClient.invalidateQueries({ queryKey: ['vacation'] });
        void queryClient.invalidateQueries({ queryKey: ['duties'] });
        void queryClient.invalidateQueries({ queryKey: ['closure-duties'] });
      }
    },
  });
}
