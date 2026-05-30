# excalidraw-storage-backend

Forked from https://gitlab.com/kiliandeca/excalidraw-storage-backend

This is a reimplementation of [excalidraw-json](https://github.com/excalidraw/excalidraw-json) suitable for self hosting you own instance of Excalidraw.

It can be used with [kiliandeca/excalidraw-fork](https://gitlab.com/kiliandeca/excalidraw-fork)

[DockerHub kiliandeca/excalidraw-storage-backend](https://hub.docker.com/r/kiliandeca/excalidraw-storage-backend)

Feature:

- Storing scenes: when you export as a link
- Storing rooms: when you create a live collaboration
- Storing images: when you export or do a live collaboration of a scene with images

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

| Name                          | Description                                                                                                                                                               | Default value                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `PORT`                        | Server listening port                                                                                                                                                     | 8080                                |
| `GLOBAL_PREFIX`               | API global prefix for every routes                                                                                                                                        | `/api/v2`                           |
| `STORAGE_URI`                 | [Keyv](https://github.com/jaredwray/keyv) connection string, example: `redis://user:pass@localhost:6379`. Availabe Keyv storage adapter: redis, mongo, postgres and mysql | `""` (in memory **non-persistent**) |
| `STORAGE_TTL`                 | Time to live for data                                                                                                                                                     | null                                |
| `LOG_LEVEL`                   | Log level (`debug`, `verbose`, `log`, `warn`, `error`)                                                                                                                    | `warn`                              |
| `BODY_LIMIT`                  | Payload size limit for scenes or images                                                                                                                                   | `50mb`                              |
| `ENABLE_POSTGRES_TTL_SERVICE` | Enabling the Postgres TTL Service will clean up expired items once a day. This will break if used with a non-postgres `STORAGE_URI`.                                      | `false`                             |
| `ENABLE_POSTGRES_TOUCH` | Enabling the Postgres Touch function allows for optimized TTL refreshes via direct SQL updates without reading the file value. Requires a valid `STORAGE_URI` to be set. | `false` |

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
