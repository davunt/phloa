# Phloa API

- The Worker entry point is `src/index.ts`; request behavior is tested in `test/index.spec.ts`.
- Preserve the single `GET /` image endpoint and its input validation unless the task changes that contract.
- Run `npm test` for behavior changes and `npm run lint` for TypeScript changes.
- Use `npm run dev` for local Worker development.
- When changing `wrangler.jsonc` bindings, run `npm run cf-typegen`.
- Before changing Cloudflare Workers features or limits, check the current Cloudflare Workers documentation.
