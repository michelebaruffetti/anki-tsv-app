# AGENTS.md

This project is a React + TypeScript + Vite web application for generating Anki TSV files. It runs entirely in the browser with no backend.

## Development Commands

- **Install Dependencies**: `npm install`
- **Start Dev Server**: `npm run dev` (typically `http://localhost:5173`)
- **Build for Production**: `npm run build` (outputs to `dist/`)
- **Preview Production Build**: `npm run preview`

## Project Structure

- `src/parser.ts`: Contains core parsing and TSV generation logic, independent of React. This module can be tested or reused in isolation.
- `src/App.tsx`: Main user interface.
- `src/main.tsx`: React application entry point.

## Testing

- The `src/parser.ts` module is designed for isolation, making it suitable for focused unit testing.
- There are no explicit test scripts defined in `package.json`, so a dedicated testing framework might need to be configured if unit/integration tests are required (e.g., `vitest` or `jest`).
