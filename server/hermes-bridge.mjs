import { spawn } from "node:child_process";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.HERMES_BRIDGE_PORT ?? 8787);
const HERMES_PROFILE = process.env.HERMES_PROFILE ?? "hermes1";
const HERMES_BIN = process.env.HERMES_BIN ?? "hermes";
const HERMES_MOCK = process.env.HERMES_MOCK !== "0";

const wss = new WebSocketServer({ port: PORT });
let runSeq = 0;

const TASK_MARKER_PROMPT = `
Eres hermes1, el agente principal de una oficina visual. Responde normalmente al usuario, pero si divides el trabajo o delegas, emite marcas estructuradas en lineas independientes para que la interfaz actualice tareas.

Formato exacto:
[[TASK agent=hermes2 status=running title="Buscar fuentes sobre el tema" progress="Revisando fuentes relevantes"]]
[[TASK agent=hermes2 status=done title="Buscar fuentes sobre el tema" result="Fuentes revisadas"]]

Reglas:
- Usa status=running cuando una subtarea empieza o cambia de progreso.
- Usa status=done cuando una subtarea termina.
- Usa status=failed si una subtarea falla.
- Usa agent=hermes2, hermes3, hermes4, etc. si delegas.
- No uses marcas para la respuesta final de hermes1 salvo que realmente quieras actualizar una subtarea.
- Las marcas deben ir en lineas propias y no deben sustituir la respuesta legible para el usuario.
`.trim();

function now() {
  return new Date().toISOString();
}

function send(ws, event) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function taskTitle(message) {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length > 72 ? `${clean.slice(0, 69)}...` : clean;
}

function topicFrom(message) {
  const words = message
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 6);
  return words.join(" ") || "la tarea";
}

function emitTaskStarted(ws, task) {
  send(ws, {
    type: "task.started",
    task,
    activity: {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      at: now(),
      agentId: task.agentId,
      taskId: task.id,
      message: `${task.agentId} empezo: ${task.title}`,
    },
  });
}

function emitTaskProgress(ws, taskId, agentId, progress) {
  send(ws, {
    type: "task.progress",
    taskId,
    agentId,
    progress,
    activity: {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      at: now(),
      agentId,
      taskId,
      message: progress,
    },
  });
}

function emitTaskCompleted(ws, taskId, agentId, result) {
  send(ws, {
    type: "task.completed",
    taskId,
    agentId,
    result,
    completedAt: now(),
    activity: {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      at: now(),
      agentId,
      taskId,
      message: `${agentId} termino su parte`,
    },
  });
}

function emitTaskFailed(ws, taskId, agentId, error) {
  send(ws, {
    type: "task.failed",
    taskId,
    agentId,
    error,
    completedAt: now(),
  });
}

function unquoteValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseMarkerAttributes(raw) {
  const attrs = {};
  const re = /(\w+)=("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[^\s]+)/g;
  let match;
  while ((match = re.exec(raw))) {
    attrs[match[1]] = unquoteValue(match[2]).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return attrs;
}

function parseTaskMarkers(text) {
  const markerRe = /\[\[TASK\s+([^\]]+)\]\]/g;
  const markers = [];
  let match;
  while ((match = markerRe.exec(text))) {
    markers.push(parseMarkerAttributes(match[1]));
  }
  return {
    cleanText: text.replace(markerRe, "").replace(/\n{3,}/g, "\n\n").trim(),
    markers,
  };
}

function markerTaskId(parentTaskId, agentId, title) {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return `${parentTaskId}_${agentId}_${slug || "subtask"}`;
}

function applyTaskMarkers(ws, parentTask, markers) {
  for (const marker of markers) {
    const agentId = marker.agent || marker.agentId;
    const status = marker.status || "running";
    const title = marker.title || marker.task || `Subtarea de ${agentId}`;
    if (!agentId) continue;

    const taskId = marker.id || markerTaskId(parentTask.id, agentId, title);
    const progress = marker.progress || marker.message || title;
    const result = marker.result || progress;
    if (status === "done" || status === "completed") {
      emitTaskCompleted(ws, taskId, agentId, result);
      send(ws, { type: "agent.said", agentId, taskId, text: result });
      continue;
    }

    if (status === "failed" || status === "error") {
      emitTaskFailed(ws, taskId, agentId, result);
      send(ws, { type: "agent.said", agentId, taskId, text: result });
      continue;
    }

    const task = {
      id: taskId,
      parentId: parentTask.id,
      title,
      agentId,
      status: "running",
      progress,
      createdAt: now(),
      startedAt: now(),
      topic: parentTask.topic,
    };
    emitTaskStarted(ws, task);
    emitTaskProgress(ws, taskId, agentId, progress);
    send(ws, { type: "agent.said", agentId, taskId, text: progress });
  }
}

function runMock(ws, task, message) {
  const topic = topicFrom(message);
  const plan = [
    { delay: 550, agent: "hermes1", text: `Estoy separando el trabajo sobre ${topic}.` },
    {
      delay: 1200,
      agent: "hermes2",
      text: `Buscando contexto util sobre ${topic}.`,
      subtask: "Buscar contexto y datos relevantes",
    },
    {
      delay: 1900,
      agent: "hermes3",
      text: `Preparando estructura para la respuesta sobre ${topic}.`,
      subtask: "Organizar hallazgos y redactar base",
    },
    { delay: 2900, agent: "hermes2", text: `Ya tengo puntos clave sobre ${topic}.` },
    { delay: 3700, agent: "hermes3", text: "Estoy cerrando una version clara y accionable." },
    { delay: 4700, agent: "hermes1", text: "Integro lo delegado y preparo la respuesta final." },
  ];

  const subtasks = new Map();
  for (const item of plan) {
    setTimeout(() => {
      if (item.subtask) {
        const subtask = {
          id: `${task.id}_${item.agent}`,
          parentId: task.id,
          title: item.subtask,
          agentId: item.agent,
          status: "running",
          progress: item.text,
          createdAt: now(),
          startedAt: now(),
          topic,
        };
        subtasks.set(item.agent, subtask.id);
        emitTaskStarted(ws, subtask);
      }
      emitTaskProgress(ws, subtasks.get(item.agent) ?? task.id, item.agent, item.text);
      send(ws, {
        type: "agent.said",
        agentId: item.agent,
        taskId: subtasks.get(item.agent) ?? task.id,
        text: item.text,
      });
    }, item.delay);
  }

  setTimeout(() => {
    for (const [agentId, subtaskId] of subtasks) {
      emitTaskCompleted(ws, subtaskId, agentId, `Parte completada por ${agentId}.`);
    }
  }, 5600);

  setTimeout(() => {
    const response = `He terminado la tarea sobre ${topic}. Coordine la investigacion, organice los puntos clave y deje el resultado registrado en tareas.`;
    send(ws, { type: "chat.delta", taskId: task.id, agentId: "hermes1", delta: response });
    send(ws, { type: "chat.final", taskId: task.id, agentId: "hermes1", message: response });
    emitTaskCompleted(ws, task.id, "hermes1", response);
  }, 6500);
}

function runHermes(ws, task, message) {
  const promptedMessage = `${TASK_MARKER_PROMPT}\n\nTarea del usuario:\n${message}`;
  const args = ["-p", HERMES_PROFILE, "chat", "-q", promptedMessage, "--quiet"];
  const child = spawn(HERMES_BIN, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let finalText = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    const delta = chunk.toString();
    finalText += delta;
    emitTaskProgress(ws, task.id, "hermes1", "Hermes esta generando respuesta...");
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.on("error", (error) => {
    send(ws, {
      type: "task.failed",
      taskId: task.id,
      agentId: "hermes1",
      error: error.message,
      completedAt: now(),
    });
  });

  child.on("close", (code) => {
    if (code !== 0) {
      emitTaskFailed(ws, task.id, "hermes1", stderr.trim() || `hermes salio con codigo ${code}`);
      return;
    }

    const parsed = parseTaskMarkers(finalText);
    applyTaskMarkers(ws, task, parsed.markers);
    const clean = parsed.cleanText || finalText.trim() || "Sin respuesta.";
    send(ws, { type: "chat.delta", taskId: task.id, agentId: "hermes1", delta: clean });
    send(ws, { type: "chat.final", taskId: task.id, agentId: "hermes1", message: clean });
    emitTaskCompleted(ws, task.id, "hermes1", clean);
  });
}

wss.on("connection", (ws) => {
  send(ws, {
    type: "bridge.ready",
    mode: HERMES_MOCK ? "mock" : "hermes",
    primaryAgentId: "hermes1",
  });

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type !== "chat.send" || typeof message.text !== "string") return;

    const task = {
      id: `task_${Date.now()}_${++runSeq}`,
      title: taskTitle(message.text),
      agentId: "hermes1",
      status: "running",
      progress: "Hermes1 recibio la tarea",
      createdAt: now(),
      startedAt: now(),
      topic: topicFrom(message.text),
    };

    emitTaskStarted(ws, task);
    send(ws, {
      type: "chat.accepted",
      taskId: task.id,
      agentId: "hermes1",
      userMessage: message.text,
      at: now(),
    });

    if (HERMES_MOCK) runMock(ws, task, message.text);
    else runHermes(ws, task, message.text);
  });
});

console.log(
  `[Hermes Lite Bridge] ws://localhost:${PORT} (${HERMES_MOCK ? "mock" : `hermes: ${HERMES_BIN}`})`,
);
