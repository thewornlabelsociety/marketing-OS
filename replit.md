# Replit setup

## Main application

The app uses its existing two-service development setup:

- Express/TypeScript backend on port `4100`
- React/Vite frontend on port `5000` (the Replit web preview)
- The frontend proxies same-origin `/api` and `/health` requests to the backend
- SQLite data is created automatically in `backend/app_data.db`

Run both services from the project root:

```bash
(cd backend && npm run dev) & (cd frontend && npm run dev)
```

The core app does not require external credentials. AI planning, Meta publishing, and the Worn Label business sync remain disabled unless their optional environment variables are configured.

Do not start the optional TOTAL EDIT worker as part of the main app workflow.