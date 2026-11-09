# RoadFix

> **Civic-tech road maintenance and pothole reporting initiative, Agra, Uttar Pradesh, India.**  
> _Note: RoadFix is an open civic-tech initiative and is not an official government service._

---

## Overview

RoadFix is a modern web application designed to bridge the gap between citizens reporting road hazards (potholes, road erosion, surface hazards) and municipal maintenance teams in Agra, Uttar Pradesh, India.

This repository currently contains **Phase 0: Project Initialization and Technical Foundation**. It establishes an accessible, type-safe, runnable foundation with zero product logic, forms, or backend mutations.

---

## Technical Stack

- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict mode enabled)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) with `@tailwindcss/vite`
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/) (`button`, `card`, `input`, `label`, `badge`, `sonner`)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Routing**: [React Router](https://reactrouter.com/) (v7)
- **Backend Client**: [@supabase/supabase-js](https://supabase.com/docs/reference/javascript) (Stubbed & optional in Phase 0)
- **Mapping (Installed)**: [Leaflet](https://leafletjs.com/) and [react-leaflet](https://react-leaflet.js.org/) (Dependencies installed only; maps are deferred to Phase 1)
- **Testing**: [Vitest](https://vitest.dev/), [React Testing Library](https://testing-library.com/), and [jsdom](https://github.com/jsdom/jsdom)
- **Code Quality**: [ESLint](https://eslint.org/) (Flat config + typescript-eslint + react-hooks) and [Prettier](https://prettier.io/)
- **CI / Deployment Targets**: [GitHub Actions](https://github.com/features/actions) and [Vercel](https://vercel.com/)

---

## Setup & Getting Started

### Prerequisites

- **Node.js**: `v20.x` or `v22.x` / `v24.x` (Tested on Node `v24.20.0`)
- **Package Manager**: `npm` (`10.x` or `11.x`)

### Installation

Clone the repository and install dependencies using the frozen lockfile:

```bash
# Clone the repository
git clone https://github.com/your-username/roadfix.git
cd roadfix

# Clean installation from package-lock.json
npm ci
```

### Running Locally

To launch the Vite development server:

```bash
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## Available Scripts

| Command              | Purpose                                                               |
| :------------------- | :-------------------------------------------------------------------- |
| `npm run dev`        | Boots local Vite development server with HMR                          |
| `npm run build`      | Compiles TypeScript and builds optimized production bundle to `dist/` |
| `npm run preview`    | Serves the production build locally for verification                  |
| `npm run lint`       | Runs ESLint analysis across all TypeScript and React files            |
| `npm run typecheck`  | Validates TypeScript types across the project (`tsc --noEmit`)        |
| `npm run test`       | Executes the Vitest test suite once (non-watch mode)                  |
| `npm run format`     | Checks file formatting compliance with Prettier                       |
| `npm run format:fix` | Automatically formats codebase files using Prettier                   |

---

## Environment Variables

In **Phase 0**, all environment variables are **completely optional**. The application boots gracefully and all routes function without any `.env` file present.

Refer to [`.env.example`](.env.example) for placeholder definitions:

```env
# The public URL of your Supabase project (optional in Phase 0)
VITE_SUPABASE_URL=

# The public anon key for your Supabase project (optional in Phase 0)
VITE_SUPABASE_ANON_KEY=
```

- When credentials are not provided, `src/lib/supabase.ts` exports `null` and logs at most one clear warning per session.
- Never commit real `.env` or `.env.local` files into source control.

---

## Project Structure

```
roadfix/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI workflow
├── public/                      # Static web assets
├── src/
│   ├── app/                     # Application shell and routing
│   │   ├── App.tsx              # Root component
│   │   └── router.tsx           # React Router route definitions
│   ├── components/
│   │   ├── layout/              # Structural layout components
│   │   │   ├── AppShell.tsx     # Semantic landmarks (<header>, <main>, <footer>)
│   │   │   ├── Header.tsx       # Wordmark, responsive navigation, skip link
│   │   │   └── Footer.tsx       # Mandated civic initiative disclaimer
│   │   └── ui/                  # shadcn/ui components
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       └── sonner.tsx
│   ├── features/                # Domain feature modules (Phase 1+ stubs)
│   │   ├── auth/                # .gitkeep
│   │   ├── dashboard/           # .gitkeep
│   │   ├── map/                 # .gitkeep
│   │   └── reports/             # .gitkeep
│   ├── lib/                     # Utilities and client wrappers
│   │   ├── env.ts               # Safe, non-throwing env validation
│   │   ├── supabase.ts          # Safe Supabase client initialization
│   │   └── utils.ts             # Tailwind class merging (cn)
│   ├── pages/                   # Application route views
│   │   ├── HomePage.tsx         # Hero section & civic intro
│   │   ├── ReportPage.tsx       # Placeholder (Phase 1)
│   │   ├── TrackPage.tsx        # Placeholder (Phase 1)
│   │   ├── OfficerPage.tsx      # Placeholder (Phase 2)
│   │   └── NotFoundPage.tsx     # 404 handler with home return link
│   ├── test/                    # Automated testing suite
│   │   ├── env.test.ts          # Environment parsing tests
│   │   ├── navigation.test.tsx  # ARIA, keyboard, and skip link tests
│   │   ├── responsive.test.tsx  # 360px mobile viewport assertions
│   │   ├── routes.test.tsx      # Route rendering assertions
│   │   ├── setup.ts             # Vitest DOM matchers setup
│   │   └── supabase.test.ts     # Client export and warning tests
│   ├── types/                   # TypeScript interfaces and stubs
│   │   └── index.ts
│   ├── index.css                # Tailwind v4 directives & WCAG AA civic palette
│   └── main.tsx                 # React DOM mount point
├── .env.example                 # Environment configuration template
├── .gitignore                   # Git ignore patterns (.env*, dist, coverage)
├── .prettierignore
├── .prettierrc                  # Prettier rules
├── components.json              # shadcn CLI configuration
├── eslint.config.js             # ESLint 9 flat configuration
├── index.html                   # HTML entry template
├── package.json
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
├── vercel.json                  # SPA routing rewrite for Vercel
├── vite.config.ts               # Vite configuration (@/ alias, Tailwind v4)
└── vitest.config.ts             # Vitest test configuration
```

---

## Deployment Notes

### Vercel

The repository includes `vercel.json` configured with single-page application (SPA) rewrites to `/index.html`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Static assets in `/assets/` and public assets are served directly before routing rewrites.

### Continuous Integration (GitHub Actions)

The `.github/workflows/ci.yml` pipeline triggers on push and pull requests targeting `main`. It executes:

1. `npm ci` (frozen lockfile validation)
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run build`

---

## Backend (Phase 2A)

The backend specification and database migrations for RoadFix are defined in SQL files under [`supabase/migrations/`](supabase/migrations/) and documented in detail in [`docs/backend.md`](docs/backend.md).

> [!NOTE]
> In Phase 2A, the backend consists of offline SQL migrations, pgTAP test suites, and architectural specifications only. No live or remote backend is actively connected to the application, and no real database credentials are configured in the frontend repository.

---

## Roadmap

Later phases will be implemented in sequential iterations:

- [x] **Phase 0: Technical Foundation** (Runnable architecture, routing, WCAG AA theme, tests, CI)
- [ ] **Phase 1: Citizen Pothole Reporting** (Photo upload, geolocation capture, interactive Leaflet map, citizen submission flow)
- [ ] **Phase 2: Municipal Officer Review Dashboard** (Status transitions, priority triage, field verification, Supabase Auth)
- [ ] **Phase 3: Public Transparency & Analytics** (Open data exports, resolution statistics, SMS/WhatsApp updates)
