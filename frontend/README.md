# Frontend

Next.js App Router seller panel. Requires Node.js 20+ and npm. This application installs and runs from this directory independently from the backend; it accesses the backend using its public HTTP(S) address.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Set `NEXT_PUBLIC_API_BASE_URL` in `.env.local` to the API address. For local use the example points to `http://localhost:3001`. On the backend set `CORS_ORIGINS=http://localhost:3000`. Start the backend separately.

## Separate server

Set `NEXT_PUBLIC_API_BASE_URL=https://api.example.com` in the frontend environment **before building**. The value is compiled into the browser bundle, so rebuild after changing it. It is public; never put a secret in any `NEXT_PUBLIC_*` variable. Configure the backend CORS origin to the frontend's exact HTTPS origin.

```sh
npm ci
npm run build
npm run start
```

Next.js defaults to port 3000 and honors `PORT`. HTTPS is required on both public services, typically through a reverse proxy. The panel is incomplete and not production-ready. It currently keeps its access token only in browser memory; a reload signs the user out. Conversations, real bot connection, human handoff and many other features are not yet implemented.
