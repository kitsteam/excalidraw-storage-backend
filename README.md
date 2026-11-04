# excalidraw-storage-backend

Forked from https://gitlab.com/kiliandeca/excalidraw-storage-backend

This is a reimplementation of [excalidraw-json](https://github.com/excalidraw/excalidraw-json) suitable for self hosting you own instance of Excalidraw.

It can be used with [kiliandeca/excalidraw-fork](https://gitlab.com/kiliandeca/excalidraw-fork)

[DockerHub kiliandeca/excalidraw-storage-backend](https://hub.docker.com/r/kiliandeca/excalidraw-storage-backend)

Feature:

- Storing scenes: when you export as a link
- Storing rooms: when you create a live collaboration
- Storing images: when you export or do a live collaboration of a scene with images
- AI features (optional): `Text to Diagram` and `Wireframe to Code`, backed by a configurable LLM

It use Keyv as a simple K/V store so you can use the database of your choice.

## Development

This project uses [pnpm](https://pnpm.io/) (pinned via the `packageManager` field) and requires Node.js `>=24`. Enable pnpm through Corepack, which ships with Node:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Common scripts:

```bash
pnpm start:dev      # start in watch mode
pnpm build          # compile to dist/
pnpm test           # run unit tests
pnpm format:check   # verify formatting
pnpm audit --prod   # check shipped dependencies for vulnerabilities
```

Alternatively, use the provided Docker Compose setup for a containerised dev environment:

```bash
docker compose up
```

## Environement Variables

| Name                          | Description                                                                                                                                                               | Default value                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `PORT`                        | Server listening port                                                                                                                                                     | 8080                                              |
| `GLOBAL_PREFIX`               | API global prefix for every routes                                                                                                                                        | `/api/v2`                                         |
| `STORAGE_URI`                 | [Keyv](https://github.com/jaredwray/keyv) connection string, example: `redis://user:pass@localhost:6379`. Availabe Keyv storage adapter: redis, mongo, postgres and mysql | `""` (in memory **non-persistent**)               |
| `STORAGE_TTL`                 | Time to live for data                                                                                                                                                     | null                                              |
| `LOG_LEVEL`                   | Minimum log level (`fatal`, `error`, `warn`, `log`, `debug`, `verbose`). Enables the given level and all more severe ones                                                 | `log` if `NODE_ENV=production`, otherwise `debug` |
| `BODY_LIMIT`                  | Payload size limit for scenes or images                                                                                                                                   | `50mb`                                            |
| `ENABLE_POSTGRES_TTL_SERVICE` | Enabling the Postgres TTL Service will clean up expired items once a day. This will break if used with a non-postgres `STORAGE_URI`.                                      | `false`                                           |
| `ENABLE_POSTGRES_TOUCH`       | Enabling the Postgres Touch function allows for optimized TTL refreshes via direct SQL updates without reading the file value. Requires a valid `STORAGE_URI` to be set.  | `false`                                           |

### Env Variables for AI features

When `AI_ENABLED` is `true`, a second server listens on `AI_PORT` and serves the endpoints the Excalidraw frontend calls for its AI features:

- `POST /v1/ai/text-to-diagram/chat-streaming`
- `POST /v1/ai/diagram-to-code/generate-streaming`

Point the frontend's `VITE_APP_AI_BACKEND` at this server, e.g. `http://localhost:8081`. `Wireframe to Code` needs a model with vision support. If `AI_LLM_MODEL` has none, set `AI_LLM_VISION_MODEL` to a vision model.

| Name                       | Description                                                                                                                                                                                                                                         | Default value |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `AI_ENABLED`               | Starts the AI server                                                                                                                                                                                                                                | `false`       |
| `AI_PORT`                  | AI server listening port                                                                                                                                                                                                                            | 8081          |
| `AI_LLM_PROVIDER`          | `openai` or `openai-compatible`                                                                                                                                                                                                                     | `openai`      |
| `AI_LLM_URL`               | Base URL of an OpenAI compatible API, e.g. `http://localhost:11434/v1` for Ollama. Required for `openai-compatible`                                                                                                                                 |               |
| `AI_LLM_TOKEN`             | API token. Required for `openai`, optional for `openai-compatible`                                                                                                                                                                                  |               |
| `AI_LLM_MODEL`             | Model name, e.g. `gpt-4o-mini` or `qwen3.5:4b`                                                                                                                                                                                                      |               |
| `AI_LLM_VISION_MODEL`      | Model for `Wireframe to Code`. Needs vision support. Falls back to `AI_LLM_MODEL`                                                                                                                                                                   |               |
| `AI_LLM_RPM`               | Requests per minute. Unset means unlimited, `0` blocks every request                                                                                                                                                                                |               |
| `AI_LLM_TPM`               | Tokens per minute. Unset means unlimited, `0` blocks every request                                                                                                                                                                                  |               |
| `AI_LLM_TPD`               | Tokens per day (UTC). Stored in the `llm_usage_counter` table of `STORAGE_URI` and shared by all instances. Without `STORAGE_URI` it is kept in memory, resets on restart and applies per instance. Unset means unlimited, `0` blocks every request |               |
| `AI_LLM_MAX_OUTPUT_TOKENS` | Output token cap per request, including reasoning tokens                                                                                                                                                                                            | 4096          |
| `AI_LLM_TIMEOUT_MS`        | Total time a request may take, including streaming. Local reasoning models may need several minutes                                                                                                                                                 | 60000         |

Example for a local Ollama:

```bash
AI_ENABLED=true AI_LLM_PROVIDER=openai-compatible AI_LLM_URL=http://localhost:11434/v1 AI_LLM_MODEL=qwen3.5:4b-16k AI_LLM_TIMEOUT_MS=300000 pnpm start:dev
```

Ollama runs models with a 4096-token context by default, which covers the prompt, the reasoning and the answer. Reasoning models often use it up before writing any output, and the request fails with "The model ran out of tokens before producing output." The OpenAI compatible API cannot change the context per request, so create a model variant with a larger one:

```bash
printf 'FROM qwen3.5:4b\nPARAMETER num_ctx 16384\n' > Modelfile
ollama create qwen3.5:4b-16k -f Modelfile
```

### Env Variables for Postgres

For setting postgres pool variables, a few code adjustment have to be made in the `storage.service.ts`:

```typescript
const store = new (require('@keyv/postgres'))({
  uri,
  max: 1,
});

const keyv = new Keyv({
  store,
  ttl,
});
```
