# Oficina - Hermes Lite Office

App para chatear con agentes Hermes en una oficina virtual. Los agentes deambulan, reciben tareas, y se sientan a trabajar mientras ves el progreso en tiempo real.

---

## Ejecutar con Docker (produccion)

```bash
git clone https://github.com/hermes-75/oficina
cd oficina

docker compose up -d --build

curl http://localhost:5174
curl -o /dev/null -s -w '%{http_code}' http://localhost:5174
```

Para probar el WebSocket:

```bash
npm i -g wscat
wscat -c ws://localhost:8787
```

Deberia responder algo como:

```json
{"type":"bridge.ready","mode":"mock","primaryAgentId":"hermes1"}
```

## Puertos

| Puerto | Servicio |
| --- | --- |
| `5174` | Frontend web |
| `8787` | Bridge WebSocket |

## Modo Demo

El bridge responde con tareas simuladas automaticas. No necesita Hermes CLI.

```bash
docker compose up -d
```

## Modo Hermes Real

Para conectar con el CLI real de Hermes, el contenedor debe poder ejecutar Hermes y leer su configuracion.

### Hermes instalado dentro del contenedor

```yaml
services:
  oficina:
    environment:
      HERMES_MOCK: "0"
      HERMES_PROFILE: "hermes1"
      HERMES_BRIDGE_PORT: "8787"
```

### Hermes instalado fuera del contenedor

Si Hermes ya esta instalado en el host, monta el binario y la carpeta de configuracion:

```yaml
services:
  oficina:
    environment:
      HERMES_MOCK: "0"
      HERMES_PROFILE: "hermes1"
      HERMES_BRIDGE_PORT: "8787"
      HERMES_BIN: "/usr/local/bin/hermes"
      HERMES_HOME: "/root/.hermes"
    volumes:
      - /RUTA/REAL/DEL/HOST/hermes:/usr/local/bin/hermes:ro
      - /RUTA/REAL/DEL/HOST/.hermes:/root/.hermes:ro
```

Primero descubre las rutas reales en el host:

```bash
which hermes
echo "$HOME"
ls -la ~/.hermes
```

Despues comprueba dentro del contenedor:

```bash
docker compose exec oficina sh
/usr/local/bin/hermes -p hermes1 chat -q "Hola, responde breve" --quiet
```

Si el binario del host es un script que depende de otros runtimes o rutas del host, tambien hay que instalar esas dependencias dentro de la imagen o montar las rutas necesarias.

## Logs

```bash
docker compose logs -f oficina
docker compose exec oficina node server/hermes-bridge.mjs
```

## Reinicio

```bash
docker compose down
docker compose up -d
docker compose up -d --build
```

## Comprobar Que Funciona

1. Frontend: abre `http://localhost:5174` y verifica que ves la oficina.
2. Conexion: el indicador muestra `Conectado (mock)` o `Conectado (hermes)`.
3. Chat: envia una tarea y observa que los agentes reaccionan.
4. WebSocket: prueba `wscat -c ws://localhost:8787`.
5. Hermes real: en logs debe verse el bridge en modo `hermes` y el contenedor debe poder ejecutar `HERMES_BIN`.

---

## Subtareas Estructuradas

En modo Hermes real, el bridge inyecta instrucciones a `hermes1` para que pueda actualizar la oficina con subtareas usando marcas en lineas independientes:

```text
[[TASK agent=hermes2 status=running title="Buscar fuentes" progress="Revisando fuentes relevantes"]]
[[TASK agent=hermes2 status=done title="Buscar fuentes" result="Fuentes revisadas"]]
```

Campos soportados:

| Campo | Ejemplo | Uso |
| --- | --- | --- |
| `agent` | `hermes2` | Agente visual que recibe la subtarea |
| `status` | `running`, `done`, `failed` | Estado que se refleja en tareas |
| `title` | `Buscar fuentes` | Titulo de la subtarea |
| `progress` | `Revisando fuentes` | Frase de trabajo visible |
| `result` | `Fuentes revisadas` | Resultado al completar o fallar |

El bridge elimina esas marcas del chat final visible y las convierte en eventos para la UI.

---

## Ejecutar En Desarrollo

```bash
npm install
npm run dev
```

Modo Hermes real:

```bash
HERMES_MOCK=0 HERMES_PROFILE=hermes1 npm run dev
```

Abre `http://localhost:5174`.

---

## Variables De Entorno

| Variable | Default | Descripcion |
| --- | --- | --- |
| `HERMES_MOCK` | `1` | `1` = demo, `0` = real |
| `HERMES_PROFILE` | `hermes1` | Perfil de Hermes a usar |
| `HERMES_BIN` | `hermes` | Ruta o comando del binario Hermes |
| `HERMES_HOME` | sin valor fijo | Ruta de configuracion de Hermes |
| `HERMES_BRIDGE_PORT` | `8787` | Puerto del bridge WebSocket |
| `VITE_HERMES_BRIDGE_URL` | `ws://localhost:8787` | URL que usa el frontend para conectar |

---

## Estructura

```text
oficina/
├── Dockerfile
├── docker-compose.yml
├── server.mjs
├── dev.mjs
├── server/
│   └── hermes-bridge.mjs
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── types.ts
│   └── officeData.ts
└── vite.config.ts
```

## Idea De Producto

- `hermes1` es el agente principal.
- El usuario solo chatea con `hermes1`.
- Cada mensaje crea una tarea.
- Si aparecen delegaciones, se crean subtareas y agentes secundarios automaticamente.
- Los agentes sin tarea pasean por la oficina.
- Los agentes con tarea vuelven a su mesa y dicen frases relacionadas con lo que hacen.
