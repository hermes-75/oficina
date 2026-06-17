# Hermes Lite Office

App simplificada para chatear con `hermes1`, ver tareas en tiempo real y representar agentes Hermes como personajes en una oficina viva.

## Ejecutar

```bash
cd hermes-lite-office
pnpm install
pnpm dev
```

La app abre el frontend en `http://localhost:5174` y el bridge WebSocket en `ws://localhost:8787`.

## Modos

Por defecto usa modo demo para validar la experiencia visual:

```bash
HERMES_MOCK=1 pnpm dev
```

Para intentar usar el CLI real:

```bash
HERMES_MOCK=0 HERMES_PROFILE=hermes1 pnpm dev
```

El bridge ejecuta:

```bash
hermes -p hermes1 chat -q "<mensaje>" --quiet
```

## Idea de producto

- `hermes1` es el agente principal.
- El usuario solo chatea con `hermes1`.
- Cada mensaje crea una tarea.
- Si aparecen delegaciones, se crean subtareas y agentes secundarios automaticamente.
- Los agentes sin tarea pasean por la oficina.
- Los agentes con tarea vuelven a su mesa y dicen frases relacionadas con lo que hacen.
