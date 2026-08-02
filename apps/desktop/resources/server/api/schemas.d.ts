import { z } from 'zod';
export declare const dayWorkTimeSchema: z.ZodObject<{
    isWorking: z.ZodBoolean;
    startMin: z.ZodNumber;
    endMin: z.ZodNumber;
    breakMin: z.ZodNumber;
}, z.core.$strip>;
export declare const weeklyWorkTimesSchema: z.ZodObject<{
    1: z.ZodObject<{
        isWorking: z.ZodBoolean;
        startMin: z.ZodNumber;
        endMin: z.ZodNumber;
        breakMin: z.ZodNumber;
    }, z.core.$strip>;
    2: z.ZodObject<{
        isWorking: z.ZodBoolean;
        startMin: z.ZodNumber;
        endMin: z.ZodNumber;
        breakMin: z.ZodNumber;
    }, z.core.$strip>;
    3: z.ZodObject<{
        isWorking: z.ZodBoolean;
        startMin: z.ZodNumber;
        endMin: z.ZodNumber;
        breakMin: z.ZodNumber;
    }, z.core.$strip>;
    4: z.ZodObject<{
        isWorking: z.ZodBoolean;
        startMin: z.ZodNumber;
        endMin: z.ZodNumber;
        breakMin: z.ZodNumber;
    }, z.core.$strip>;
    5: z.ZodObject<{
        isWorking: z.ZodBoolean;
        startMin: z.ZodNumber;
        endMin: z.ZodNumber;
        breakMin: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const employeeInputSchema: z.ZodObject<{
    firstName: z.ZodString;
    lastName: z.ZodString;
    staffType: z.ZodEnum<{
        doctor: "doctor";
        mfa: "mfa";
        trainee: "trainee";
    }>;
    isPcm: z.ZodBoolean;
    employment: z.ZodEnum<{
        fulltime: "fulltime";
        parttime: "parttime";
    }>;
    targetHoursPerWeek: z.ZodNumber;
    canHomeoffice: z.ZodBoolean;
    color: z.ZodString;
    entryDate: z.ZodNullable<z.ZodString>;
    exitDate: z.ZodNullable<z.ZodString>;
    isActive: z.ZodBoolean;
    sortOrder: z.ZodNumber;
    notes: z.ZodString;
    workTimes: z.ZodObject<{
        1: z.ZodObject<{
            isWorking: z.ZodBoolean;
            startMin: z.ZodNumber;
            endMin: z.ZodNumber;
            breakMin: z.ZodNumber;
        }, z.core.$strip>;
        2: z.ZodObject<{
            isWorking: z.ZodBoolean;
            startMin: z.ZodNumber;
            endMin: z.ZodNumber;
            breakMin: z.ZodNumber;
        }, z.core.$strip>;
        3: z.ZodObject<{
            isWorking: z.ZodBoolean;
            startMin: z.ZodNumber;
            endMin: z.ZodNumber;
            breakMin: z.ZodNumber;
        }, z.core.$strip>;
        4: z.ZodObject<{
            isWorking: z.ZodBoolean;
            startMin: z.ZodNumber;
            endMin: z.ZodNumber;
            breakMin: z.ZodNumber;
        }, z.core.$strip>;
        5: z.ZodObject<{
            isWorking: z.ZodBoolean;
            startMin: z.ZodNumber;
            endMin: z.ZodNumber;
            breakMin: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    skillIds: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const workAreaInputSchema: z.ZodObject<{
    plan: z.ZodEnum<{
        doctor: "doctor";
        mfa: "mfa";
    }>;
    name: z.ZodString;
    description: z.ZodString;
    kind: z.ZodEnum<{
        room: "room";
        service: "service";
        office: "office";
        homeoffice: "homeoffice";
        housecall: "housecall";
    }>;
    isCritical: z.ZodBoolean;
    minStaff: z.ZodNumber;
    maxStaff: z.ZodNullable<z.ZodNumber>;
    requiresHomeoffice: z.ZodBoolean;
    rotationMinPerWeek: z.ZodNullable<z.ZodNumber>;
    icon: z.ZodString;
    color: z.ZodString;
    sortOrder: z.ZodNumber;
    isActive: z.ZodBoolean;
    requiredSkillIds: z.ZodArray<z.ZodString>;
    blockIds: z.ZodArray<z.ZodString>;
    blockMinStaff: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
}, z.core.$strip>;
export declare const skillInputSchema: z.ZodObject<{
    name: z.ZodString;
    category: z.ZodString;
    description: z.ZodString;
    isActive: z.ZodBoolean;
}, z.core.$strip>;
export declare const dayBlockInputSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    weekday: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>, z.ZodLiteral<3>, z.ZodLiteral<4>, z.ZodLiteral<5>]>;
    label: z.ZodString;
    kind: z.ZodEnum<{
        consultation: "consultation";
        backoffice: "backoffice";
        closed: "closed";
    }>;
    startMin: z.ZodNumber;
    endMin: z.ZodNumber;
    sortOrder: z.ZodNumber;
}, z.core.$strip>;
/** Das gesamte Wochenmodell wird atomar ersetzt, nicht Block fuer Block. */
export declare const dayBlocksInputSchema: z.ZodObject<{
    blocks: z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        weekday: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>, z.ZodLiteral<3>, z.ZodLiteral<4>, z.ZodLiteral<5>]>;
        label: z.ZodString;
        kind: z.ZodEnum<{
            consultation: "consultation";
            backoffice: "backoffice";
            closed: "closed";
        }>;
        startMin: z.ZodNumber;
        endMin: z.ZodNumber;
        sortOrder: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const matrixEntryInputSchema: z.ZodObject<{
    workAreaId: z.ZodString;
    clearance: z.ZodEnum<{
        solo: "solo";
        supervised: "supervised";
        blocked: "blocked";
    }>;
    preference: z.ZodEnum<{
        never: "never";
        preferred: "preferred";
        neutral: "neutral";
        dislike: "dislike";
    }>;
    minPerWeek: z.ZodNullable<z.ZodNumber>;
    maxPerWeek: z.ZodNullable<z.ZodNumber>;
    exemptRotation: z.ZodBoolean;
}, z.core.$strip>;
export declare const matrixInputSchema: z.ZodObject<{
    entries: z.ZodArray<z.ZodObject<{
        workAreaId: z.ZodString;
        clearance: z.ZodEnum<{
            solo: "solo";
            supervised: "supervised";
            blocked: "blocked";
        }>;
        preference: z.ZodEnum<{
            never: "never";
            preferred: "preferred";
            neutral: "neutral";
            dislike: "dislike";
        }>;
        minPerWeek: z.ZodNullable<z.ZodNumber>;
        maxPerWeek: z.ZodNullable<z.ZodNumber>;
        exemptRotation: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const holidaySettingsSchema: z.ZodObject<{
    state: z.ZodEnum<{
        BW: "BW";
        BY: "BY";
        BE: "BE";
        BB: "BB";
        HB: "HB";
        HH: "HH";
        HE: "HE";
        MV: "MV";
        NI: "NI";
        NW: "NW";
        RP: "RP";
        SL: "SL";
        SN: "SN";
        ST: "ST";
        SH: "SH";
        TH: "TH";
    }>;
    options: z.ZodObject<{
        assumptionOfMary: z.ZodOptional<z.ZodBoolean>;
        corpusChristi: z.ZodOptional<z.ZodBoolean>;
        augsburgPeaceFestival: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    additionalClosedDates: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const userInputSchema: z.ZodObject<{
    username: z.ZodString;
    role: z.ZodEnum<{
        admin: "admin";
        employee: "employee";
    }>;
    employeeId: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
//# sourceMappingURL=schemas.d.ts.map