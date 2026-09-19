import { Router } from 'express';
import { listEmployees } from '../../db/repositories/employees.js';
import { requireAuth } from '../../auth/middleware.js';

export function employeesRouter(): Router {
  const router = Router();

  /**
   * Die Liste ist fuer alle Angemeldeten sichtbar - jede muss wissen, wer
   * zum Team gehoert. Vertrauliche Felder (Notizen, Konten) liefert diese
   * Route nicht aus; sie haengen an eigenen, geschuetzten Endpunkten.
   */
  router.get('/', requireAuth, (req, res) => {
    const includeInactive = req.user?.role === 'admin' && req.query.includeInactive === '1';
    const employees = listEmployees(req.db, { includeInactive });

    if (req.user?.role === 'admin') {
      res.json({ employees });
      return;
    }

    res.json({
      employees: employees.map(({ notes: _notes, ...rest }) => rest),
    });
  });

  return router;
}
