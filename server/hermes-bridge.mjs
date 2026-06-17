import { spawn } from "node:child_process";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.HERMES_BRIDGE_PORT ?? 8787);
const HERMES_PROFILE = process.env.HERMES_PROFILE ?? "hermes1";
const HERMES_MOCK = process.env.HERMES_MOCK !== "0";

const wss = new WebSocketServer({ port: PORT });
let runSeq = 0;

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
  const args = ["-p", HERMES_PROFILE, "chat", "-q", message, "--quiet"];
  const child = spawn("hermes", args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let finalText = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    const delta = chunk.toString();
    finalText += delta;
    send(ws, { type: "chat.delta", taskId: task.id, agentId: "hermes1", delta });
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
      send(ws, {
        type: "task.failed",
        taskId: task.id,
        agentId: "hermes1",
        error: stderr.trim() || `hermes salio con codigo ${code}`,
        completedAt: now(),
      });
      return;
    }

    const clean = finalText.trim() || "Sin respuesta.";
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

console.log(`[Hermes Lite Bridge] ws://localhost:${PORT} (${HERMES_MOCK ? "mock" : "hermes"})`);
