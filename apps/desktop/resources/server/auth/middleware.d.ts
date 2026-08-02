import type { NextFunction, Request, Response } from 'express';
import type { SessionUser } from '@haeppi/shared';
import type { Db } from '../db/index.js';
declare module 'express-serve-static-core' {
    interface Request {
        user?: SessionUser;
        db: Db;
    }
}
/** Legt die angemeldete Person an den Request, ohne den Zugriff zu erzwingen. */
export declare function attachUser(req: Request, _res: Response, next: NextFunction): void;
export declare function requireAuth(req: Request, res: Response, next: NextFunction): void;
export declare function requireAdmin(req: Request, res: Response, next: NextFunction): void;
/**
 * Double-Submit-Cookie gegen CSRF.
 *
 * Das Session-Cookie ist HttpOnly und `SameSite=Lax`, was fremde
 * Formular-POSTs bereits abwehrt. Das CSRF-Token ist die zweite Schranke:
 * Es steht in einem lesbaren Cookie, und der Client muss es zusaetzlich im
 * Header mitschicken - was eine fremde Seite nicht kann.
 */
export declare function requireCsrf(req: Request, res: Response, next: NextFunction): void;
/** Erlaubt den Zugriff nur auf die eigenen Daten - oder der Praxisleitung auf alle. */
export declare function requireSelfOrAdmin(getEmployeeId: (req: Request) => string | undefined): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=middleware.d.ts.map