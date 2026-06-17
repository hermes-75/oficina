# Oficina — Hermes Lite Office

App para chatear con agentes Hermes en una oficina virtual. Los agentes deambulan,
reciben tareas, y se sientan a trabajar mientras ves el progreso en tiempo real.

---

## Ejecutar con Docker (producción)

```bash
# Clonar y entrar
git clone https://github.com/hermes-75/oficina
cd oficina

# Construir y arrancar
docker compose up -d --build

# Verificar
curl http://localhost:5174               # → HTML del frontend
curl -o /dev/null -s -w '%{http_code}' http://localhost:5174   # → 200

# Probar WebSocket (necesita wscat o similar)
npm i -g wscat
wscat -c ws://localhost:8787
# Debería responder: {"type":"bridge.ready","mode":"mock",...}
```

### Puertos

| Puerto | Servicio       |
|--------|----------------|
| 5174   | Frontend web   |
| 8787   | Bridge WebSocket |

### Modo demo (por defecto)

El bridge responde con tareas simuladas automáticas. No necesita Hermes CLI.

```
docker compose up -d
```

### Modo real (con Hermes CLI)

Para conectar con el CLI de Hermes real, necesitas:

1. Tener `hermes` instalado **dentro del contenedor** o **montado desde el host**
2. Crear un docker-compose.override.yml:

```yaml
services:
  oficina:
    environment:
      - HERMES_MOCK=0
      - HERMES_PROFILE=hermes1
      - HERMES_BRIDGE_PORT=8787
    volumes:
      - /usr/local/bin/hermes:/usr/local/bin/hermes:ro       # Montar CLI
      - $HOME/.hermes:/root/.hermes:ro                       # Config Hermes
```

O directamente con variables de entorno:

```bash
HERMES_MOCK=0 HERMES_PROFILE=hermes1 docker compose up -d
```

> **Nota**: El bridge ejecuta `hermes -p <profile> chat -q "<mensaje>" --quiet`.
> Si `hermes` no está disponible dentro del contenedor, monta el binario
> desde el host o instálalo en una imagen personalizada.

### Logs

```bash
# Web
docker compose logs -f oficina

# Bridge exclusivamente
docker compose exec oficina node server/hermes-bridge.mjs
```

### Reinicio

```bash
docker compose down         # Parar
docker compose up -d        # Reanudar
docker compose up -d --build  # Reconstruir y arrancar
```

### Cómo comprobar que funciona

1. **Frontend**: abre `http://localhost:5174` — ves la oficina con agentes.
2. **Conexión**: el indicador muestra "Conectado (mock)" o "Conectado (hermes)".
3. **Chat**: escribe un mensaje y pulsa enviar — los agentes reaccionan.
4. **WebSocket directo**:
   ```bash
   wscat -c ws://localhost:8787
   # → {"type":"bridge.ready","mode":"mock","primaryAgentId":"hermes1"}
   ```

---

## Ejecutar en desarrollo (sin Docker)

```bash
pnpm install        # o npm install
pnpm dev            # Modo demo (HERMES_MOCK=1)

# O con Hermes real
HERMES_MOCK=0 HERMES_PROFILE=hermes1 pnpm dev
```

Abre `http://localhost:5174`.

---

## Variables de entorno

| Variable                | Default              | Descripción                                |
|-------------------------|----------------------|--------------------------------------------|
| `HERMES_MOCK`           | `1`                  | `1` = demo, `0` = real                     |
| `HERMES_PROFILE`        | `hermes1`            | Perfil de Hermes a usar                    |
| `HERMES_BRIDGE_PORT`    | `8787`               | Puerto del bridge WebSocket                |
| `VITE_HERMES_BRIDGE_URL`| `ws://localhost:8787` | URL que usa el frontend para conectar       |

---

## Estructura

```
oficina/
├── Dockerfile            # Build multi-etapa
├── docker-compose.yml    # Orquestación
├── server.mjs            # Servidor producción (frontend + bridge)
├── dev.mjs               # Servidor desarrollo (vite dev + bridge)
├── server/
│   └── hermes-bridge.mjs # Bridge WebSocket (mock ↔ Hermes real)
├── src/
│   ├── App.tsx           # UI principal
│   ├── main.tsx          # Entry point
│   ├── types.ts          # Tipos compartidos
│   └── officeData.ts     # Datos de agentes y oficina
└── vite.config.ts
```
