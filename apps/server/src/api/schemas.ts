import { z } from 'zod';

const MINUTE = z.number().int().min(0).max(1440);
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet ein Datum im Format JJJJ-MM-TT');
const HEX_COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Erwartet eine Farbe wie #3b82f6');

export const dayWorkTimeSchema = z
  .object({
    isWorking: z.boolean(),
    startMin: MINUTE,
    endMin: MINUTE,
    breakMin: z.number().int().min(0).max(480),
  })
  .refine((day) => !day.isWorking || day.endMin > day.startMin, {
    message: 'Das Arbeitsende muss nach dem Beginn liegen.',
  });

export const weeklyWorkTimesSchema = z.object({
  1: dayWorkTimeSchema,
  2: dayWorkTimeSchema,
  3: dayWorkTimeSchema,
  4: dayWorkTimeSchema,
  5: dayWorkTimeSchema,
});

export const employeeInputSchema = z.object({
  firstName: z.string().trim().min(1, 'Der Vorname fehlt.').max(80),
  lastName: z.string().trim().min(1, 'Der Nachname fehlt.').max(80),
  staffType: z.enum(['doctor', 'mfa', 'trainee']),
  isPcm: z.boolean(),
  employment: z.enum(['fulltime', 'parttime']),
  targetHoursPerWeek: z.number().min(0).max(80),
  canHomeoffice: z.boolean(),
  color: HEX_COLOR,
  entryDate: ISO_DATE.nullable(),
  exitDate: ISO_DATE.nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
  notes: z.string().max(4000),
  workTimes: weeklyWorkTimesSchema,
  skillIds: z.array(z.string()),
});

export const workAreaInputSchema = z
  .object({
    plan: z.enum(['doctor', 'mfa']),
    name: z.string().trim().min(1, 'Der Name fehlt.').max(80),
    description: z.string().max(500),
    kind: z.enum(['room', 'service', 'office', 'homeoffice', 'housecall']),
    isCritical: z.boolean(),
    minStaff: z.number().int().min(0).max(20),
    maxStaff: z.number().int().min(0).max(20).nullable(),
    requiresHomeoffice: z.boolean(),
    rotationMinPerWeek: z.number().int().min(0).max(10).nullable(),
    icon: z.string().min(1).max(8),
    color: HEX_COLOR,
    sortOrder: z.number().int().min(0).max(9999),
    isActive: z.boolean(),
    requiredSkillIds: z.array(z.string()),
    blockIds: z.array(z.string()),
  })
  .refine((area) => area.maxStaff === null || area.maxStaff >= area.minStaff, {
    message: 'Die Obergrenze darf nicht unter der Mindestbesetzung liegen.',
    path: ['maxStaff'],
  });

export const skillInputSchema = z.object({
  name: z.string().trim().min(1, 'Der Name fehlt.').max(80),
  category: z.string().trim().min(1).max(40),
  description: z.string().max(500),
  isActive: z.boolean(),
});

export const dayBlockInputSchema = z
  .object({
    id: z.string().optional(),
    weekday: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    label: z.string().trim().min(1, 'Die Bezeichnung fehlt.').max(60),
    kind: z.enum(['consultation', 'backoffice', 'closed']),
    startMin: MINUTE,
    endMin: MINUTE,
    sortOrder: z.number().int().min(0).max(99),
  })
  .refine((block) => block.endMin > block.startMin, {
    message: 'Das Ende des Blocks muss nach dem Beginn liegen.',
    path: ['endMin'],
  });

/** Das gesamte Wochenmodell wird atomar ersetzt, nicht Block fuer Block. */
export const dayBlocksInputSchema = z.object({
  blocks: z.array(dayBlockInputSchema).max(40),
});

export const matrixEntryInputSchema = z
  .object({
    workAreaId: z.string(),
    clearance: z.enum(['solo', 'supervised', 'blocked']),
    preference: z.enum(['preferred', 'neutral', 'dislike', 'never']),
    minPerWeek: z.number().int().min(0).max(20).nullable(),
    maxPerWeek: z.number().int().min(0).max(20).nullable(),
    exemptRotation: z.boolean(),
  })
  .refine(
    (entry) =>
      entry.minPerWeek === null ||
      entry.maxPerWeek === null ||
      entry.minPerWeek <= entry.maxPerWeek,
    { message: 'Das Minimum darf nicht über dem Maximum liegen.', path: ['minPerWeek'] },
  );

export const matrixInputSchema = z.object({
  entries: z.array(matrixEntryInputSchema).max(500),
});

export const holidaySettingsSchema = z.object({
  state: z.enum([
    'BW',
    'BY',
    'BE',
    'BB',
    'HB',
    'HH',
    'HE',
    'MV',
    'NI',
    'NW',
    'RP',
    'SL',
    'SN',
    'ST',
    'SH',
    'TH',
  ]),
  options: z.object({
    assumptionOfMary: z.boolean().optional(),
    corpusChristi: z.boolean().optional(),
    augsburgPeaceFestival: z.boolean().optional(),
  }),
  additionalClosedDates: z.array(ISO_DATE).max(200),
});

export const userInputSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Der Benutzername braucht mindestens 3 Zeichen.')
    .max(40)
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      'Erlaubt sind Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich.',
    ),
  role: z.enum(['admin', 'employee']),
  employeeId: z.string().nullable(),
});
