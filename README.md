# AI Face Monitor Frontend

Responsive Next.js interface deployed on Netlify. All browser UI, styles,
public assets and frontend tests live in this folder.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` when you want the UI to use a local API.
Without that override, production uses the hosted Render backend.

## Production validation

```bash
npm test
npm run lint
```

Netlify uses `npm run build` and publishes the generated `out` directory.
