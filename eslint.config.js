import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Die `no-restricted-syntax`-Regeln hier sind keine Stilfragen, sondern
 * Absicherungen gegen konkrete Fehler der Vorgaengerversion.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/release/**',
      '**/*.d.ts',
      'coverage/**',
      // Von apps/desktop/scripts/prepare-resources.mjs erzeugt: der
      // gebaute Server und die gebaute Oberflaeche.
      'apps/desktop/server-dist/**',
      'apps/desktop/resources/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-syntax': [
        'error',
        {
          // In v1 an acht Stellen benutzt. Erzeugt in Europe/Berlin fuer ein
          // lokal konstruiertes Mitternachtsdatum den VORTAG.
          selector:
            "CallExpression[callee.property.name='split'][callee.object.callee.property.name='toISOString']",
          message:
            'toISOString().split() liefert in CET/CEST den Vortag. Stattdessen toLocalISODate() aus @haeppi/shared verwenden.',
        },
      ],
    },
  },

  {
    // Der Scheduler muss reproduzierbar sein: gleicher Input, gleicher Plan.
    // Sonst laesst sich ein Dienstplan weder testen noch erklaeren.
    files: ['packages/shared/src/scheduler/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'Der Scheduler muss deterministisch sein. Reihenfolge ueber sort_order/id stabilisieren.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            'Der Scheduler darf nicht von der aktuellen Uhrzeit abhaengen - Zeitpunkte gehoeren in den Input.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'Der Scheduler darf nicht von der aktuellen Uhrzeit abhaengen - Zeitpunkte gehoeren in den Input.',
        },
      ],
    },
  },

  {
    files: ['apps/client/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  {
    files: ['apps/server/**/*.ts', 'packages/**/*.ts', '**/*.mjs', '**/*.config.{js,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
