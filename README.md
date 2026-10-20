<h1 align="center">Phloa</h1>
<div align="center">
API for generating free placeholder images for your apps.
</div>

## Overview

Phloa is a TypeScript + [Node.js](https://nodejs.org/en/) API that is desgned to be hosted using [Cloudflare Worker](https://www.cloudflare.com/products/workers/). Images are generated on demand for the requested aspect ratio.

## Endpoint

`GET /` returns a PNG placeholder image. It accepts these optional query parameters:

- `ratio`: Two positive integers separated by `:`, from `1:4` to `4:1`. Defaults to `16:9`.
- `color`: The color for the polka dots and center square. Allowed values are `red`, `green`, `blue`, `orange`, and `cyan`; it defaults to black.

## Commands

- `npm run dev` - Run worker for local development
- `npm run lint` - Run oxlint
- `npm run fmt` - Run oxfmt
- `npm run test` - Run tests using vitest

## Structure

- `src` - contains the files related to single API endpoint for generating images.
- `test` - Vitest test files
