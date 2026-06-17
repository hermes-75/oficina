/// <reference types="vite/client" />

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  CircleStop,
  MessageSquareText,
  Send,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { ActivityEvent, Agent, BridgeEvent, ChatMessage, Task } from "./types";
import { initialAgents, doors, emoteForStatus, makeAgent, poi, resolveFacing, workingPhrase } from "./officeData";
import PixelAvatar from "./PixelAvatar";

const BRIDGE_URL = import.meta.env.VITE_HERMES_BRIDGE_URL ?? "ws://localhost:8787";

function stamp() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function formatTime(value?: string) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function nextIdlePosition(agent: Agent) {
  const options = poi.filter((item) => item.id !== agent.lastActivity);
  const picked = options[Math.floor(Math.random() * options.length)] ?? poi[0];
  const phrase = picked.phrases[Math.floor(Math.random() * picked.phrases.length)] ?? picked.label;
  return { picked, phrase };
}

export default function App() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<"mock" | "hermes" | "offline">("offline");
  const [input, setInput] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("hermes1");
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "system",
      text: "Chat directo con Hermes 1. Cada mensaje se reflejara como tarea.",
      at: stamp(),
    },
  ]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const poseTimersRef = useRef(new Map<string, number>());

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const activeTasks = tasks.filter((task) => task.status === "running");
  const completedTasks = tasks.filter((task) => task.status !== "running");

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  function upsertAgent(agentId: string, patch: Partial<Agent>) {
    setAgents((current) => {
      const existing = current.find((agent) => agent.id === agentId);
      const base = existing ?? makeAgent(agentId);
      const next = { ...base, ...patch };
      return existing
        ? current.map((agent) => (agent.id === agentId ? next : agent))
        : [...current, next];
    });
  }

  function setAgentMotion(agentId: string, motion: Agent["motion"], delayToIdleMs?: number) {
    const timerMap = poseTimersRef.current;
    const oldTimer = timerMap.get(agentId);
    if (oldTimer) {
      window.clearTimeout(oldTimer);
      timerMap.delete(agentId);
    }

    upsertAgent(agentId, { motion });

    if (delayToIdleMs && delayToIdleMs > 0) {
      const timer = window.setTimeout(() => {
        timerMap.delete(agentId);
        setAgents((current) =>
          current.map((agent): Agent =>
            agent.id === agentId ? { ...agent, motion: "idle" } : agent,
          ),
        );
      }, delayToIdleMs);
      timerMap.set(agentId, timer);
    }
  }

  function pushActivity(event?: ActivityEvent) {
    if (!event) return;
    setActivity((current) => [event, ...current].slice(0, 40));
  }

  function handleBridgeEvent(event: BridgeEvent) {
    if (event.type === "bridge.ready") {
      setMode(event.mode);
      setConnected(true);
      upsertAgent(event.primaryAgentId, { status: "wandering", lastActivity: "Conectado", emote: undefined });
      return;
    }

    if (event.type === "chat.accepted") {
      setMessages((current) => [
        ...current,
        {
          id: id("msg"),
          role: "user",
          text: event.userMessage,
          taskId: event.taskId,
          at: event.at,
        },
      ]);
      return;
    }

    if (event.type === "task.started") {
      setTasks((current) => {
        const exists = current.some((task) => task.id === event.task.id);
        return exists
          ? current.map((task) => (task.id === event.task.id ? { ...task, ...event.task } : task))
          : [event.task, ...current];
      });
      upsertAgent(event.task.agentId, {
        status: "working",
        currentTaskId: event.task.id,
        currentTaskTitle: event.task.title,
        lastActivity: event.task.progress ?? `Trabajando en ${event.task.title}`,
        lastSaid: workingPhrase(event.task.title, event.task.progress),
        phraseKind: "working",
        motion: "idle",
        facing: "down",
        emote: emoteForStatus("working"),
      });
      setAgents((current) =>
        current.map((agent) =>
          agent.id === event.task.agentId ? { ...agent, position: agent.desk } : agent,
        ),
      );
      pushActivity(event.activity);
      return;
    }

    if (event.type === "task.progress") {
      setTasks((current) =>
        current.map((task) =>
          task.id === event.taskId ? { ...task, progress: event.progress } : task,
        ),
      );
      const task = taskById.get(event.taskId);
      upsertAgent(event.agentId, {
        status: "working",
        currentTaskId: event.taskId,
        currentTaskTitle: task?.title,
        lastActivity: event.progress,
        lastSaid: workingPhrase(task?.title, event.progress),
        phraseKind: "working",
        motion: "idle",
        facing: "down",
        emote: emoteForStatus("working"),
      });
      setAgents((current) =>
        current.map((agent) =>
          agent.id === event.agentId ? { ...agent, position: agent.desk } : agent,
        ),
      );
      pushActivity(event.activity);
      return;
    }

    if (event.type === "agent.said") {
      upsertAgent(event.agentId, {
        lastSaid: event.text,
        lastActivity: event.text,
        phraseKind: "working",
      });
      return;
    }

    if (event.type === "chat.delta") {
      upsertAgent(event.agentId, { lastSaid: event.delta.slice(-120), phraseKind: "working" });
      return;
    }

    if (event.type === "chat.final") {
      setMessages((current) => [
        ...current,
        {
          id: id("msg"),
          role: "assistant",
          agentId: event.agentId,
          taskId: event.taskId,
          text: event.message,
          at: stamp(),
        },
      ]);
      return;
    }

    if (event.type === "task.completed") {
      setTasks((current) =>
        current.map((task) =>
          task.id === event.taskId
            ? {
                ...task,
                status: "done",
                result: event.result,
                completedAt: event.completedAt,
              }
            : task,
        ),
      );
      upsertAgent(event.agentId, {
        status: "done",
        currentTaskId: undefined,
        currentTaskTitle: undefined,
        lastActivity: "Tarea terminada",
        lastSaid: "Listo. Dejo esto registrado en tareas.",
        phraseKind: "working",
        motion: "idle",
        facing: "down",
        emote: emoteForStatus("done"),
      });
      pushActivity(event.activity);
      window.setTimeout(() => {
        setAgents((current) =>
          current.map((agent): Agent => {
            if (agent.id !== event.agentId || agent.status === "working") return agent;
            const { picked, phrase } = nextIdlePosition(agent);
            return {
              ...agent,
              status: "wandering" as const,
              position: picked.position,
              motion: "walk" as const,
              lastActivity: picked.id,
              lastSaid: phrase,
              phraseKind: "idle",
              emote: undefined,
            };
          }),
        );
        setAgentMotion(event.agentId, "walk", 900);
      }, 2500);
      return;
    }

    if (event.type === "task.failed") {
      setTasks((current) =>
        current.map((task) =>
          task.id === event.taskId
            ? { ...task, status: "failed", result: event.error, completedAt: event.completedAt }
            : task,
        ),
      );
      upsertAgent(event.agentId, {
        status: "failed",
        currentTaskId: undefined,
        currentTaskTitle: undefined,
        lastActivity: event.error,
        lastSaid: "He tenido un fallo con esta tarea.",
        phraseKind: "working",
        motion: "idle",
        facing: "down",
        emote: emoteForStatus("failed"),
      });
    }
  }

  useEffect(() => {
    const ws = new WebSocket(BRIDGE_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setMode("offline");
    };
    ws.onerror = () => {
      setConnected(false);
      setMode("offline");
    };
    ws.onmessage = (raw) => {
      try {
        handleBridgeEvent(JSON.parse(raw.data) as BridgeEvent);
      } catch {
        // Ignore malformed bridge messages.
      }
    };

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAgents((current) => {
        const next = current.map((agent): Agent => {
          if (agent.status === "working") return agent;
          const { picked, phrase } = nextIdlePosition(agent);
          const facing = resolveFacing(agent.position, picked.position);
          const timerMap = poseTimersRef.current;
          const oldTimer = timerMap.get(agent.id);
          if (oldTimer) {
            window.clearTimeout(oldTimer);
            timerMap.delete(agent.id);
          }
          const idleTimer = window.setTimeout(() => {
            timerMap.delete(agent.id);
            setAgents((latest) =>
              latest.map((item) =>
                item.id === agent.id ? { ...item, motion: "idle" } : item,
              ),
            );
          }, 900);
          timerMap.set(agent.id, idleTimer);
          return {
            ...agent,
            status: "wandering",
            position: picked.position,
            facing,
            motion: "walk",
            lastActivity: picked.id,
            lastSaid: phrase,
            phraseKind: "idle",
            emote: undefined,
          };
        });
        return next;
      });
    }, 7000);

    return () => window.clearInterval(timer);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "chat.send", text }));
    setInput("");
  }

  return (
    <main className="app-shell">
      <section className="office-panel" aria-label="Oficina Hermes">
        <header className="top-strip">
        <div>
          <span className="eyebrow">Hermes Lite Office</span>
          <h1>Chat con Hermes 1</h1>
        </div>
          <div className={`connection-pill ${connected ? "online" : "offline"}`}>
            {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span>{connected ? `Conectado (${mode})` : "Sin bridge"}</span>
          </div>
        </header>

        <Office agents={agents} selectedAgentId={selectedAgentId} onSelect={setSelectedAgentId} />
      </section>

      <aside className="side-panel" aria-label="Control Hermes">
        <AgentInspector agent={selectedAgent} task={selectedAgent?.currentTaskId ? taskById.get(selectedAgent.currentTaskId) : undefined} />
        <Chat messages={messages} value={input} connected={connected} onChange={setInput} onSubmit={submit} />
      </aside>

      <section className="work-panel" aria-label="Tareas y actividad">
        <TaskList title="Tareas activas" icon={<CircleStop size={17} />} tasks={activeTasks} agents={agents} onAgentSelect={setSelectedAgentId} />
        <TaskList title="Completadas" icon={<CheckCircle2 size={17} />} tasks={completedTasks.slice(0, 6)} agents={agents} onAgentSelect={setSelectedAgentId} />
        <ActivityFeed events={activity} />
      </section>
    </main>
  );
}

function Office({
  agents,
  selectedAgentId,
  onSelect,
}: {
  agents: Agent[];
  selectedAgentId: string;
  onSelect: (agentId: string) => void;
}) {
  return (
    <div className="office-floor">
      <div className="room-grid" />
      <div className="zone coffee">Cafe</div>
      <div className="zone board">Pizarra</div>
      <div className="zone archive">Archivo</div>
      <div className="zone sofa">Sofa</div>

      {agents.map((agent) => (
        <div
          key={`desk_${agent.id}`}
          className={`desk ${agent.status === "working" ? "desk-active" : ""}`}
          style={{ left: `${agent.desk.x}%`, top: `${agent.desk.y}%` }}
        >
          <span>{agent.name}</span>
        </div>
      ))}

      {doors.map((door) => (
        <div
          key={`door_${door.side}`}
          className={`door door-${door.side}`}
          style={{ left: `${door.position.x}%`, top: `${door.position.y}%` }}
          title={door.label}
        >
          <span className="door-frame" />
          <span className="door-leaf" />
        </div>
      ))}

      {agents.map((agent) => (
        <button
          key={agent.id}
          className={`agent ${selectedAgentId === agent.id ? "selected" : ""} ${agent.status} ${agent.motion}`}
          style={{
            left: `${agent.position.x}%`,
            top: `${agent.position.y}%`,
            ["--agent-color" as string]: agent.color,
          }}
          type="button"
          onClick={() => onSelect(agent.id)}
          title={`${agent.name}: ${agent.lastActivity ?? agent.status}`}
        >
          <span className="agent-shadow" />
          <PixelAvatar agent={agent} />
          <span className="agent-name">{agent.name}</span>
          {agent.emote ? <span className="agent-emote">{agent.emote}</span> : null}
          {agent.lastSaid ? <span className={`bubble ${agent.phraseKind}`}>{agent.lastSaid}</span> : null}
        </button>
      ))}
    </div>
  );
}

function AgentInspector({ agent, task }: { agent?: Agent; task?: Task }) {
  if (!agent) return null;

  return (
    <section className="agent-card">
      <div className="agent-card-head">
        <div className="agent-swatch" style={{ background: agent.color }} />
        <div>
          <h2>{agent.name}</h2>
          <p>{agent.role}</p>
        </div>
        <span className={`status-dot ${agent.status}`} />
      </div>
      <dl className="compact-list">
        <div>
          <dt>Estado</dt>
          <dd>{agent.status}</dd>
        </div>
        <div>
          <dt>Tarea</dt>
          <dd>{task?.title ?? "Sin tarea activa"}</dd>
        </div>
        <div>
          <dt>Actividad</dt>
          <dd>{agent.lastActivity ?? "Esperando"}</dd>
        </div>
      </dl>
    </section>
  );
}

function Chat({
  messages,
  value,
  connected,
  onChange,
  onSubmit,
}: {
  messages: ChatMessage[];
  value: string;
  connected: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <section className="chat-panel">
      <div className="panel-title">
        <MessageSquareText size={17} />
        <h2>Chat principal</h2>
      </div>
      <div className="messages">
        {messages.map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            <span>{message.agentId ?? message.role}</span>
            <p>{message.text}</p>
          </article>
        ))}
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Escribe una tarea para Hermes 1..."
          rows={3}
        />
        <button type="submit" disabled={!connected || value.trim().length === 0} title="Enviar">
          <Send size={18} />
        </button>
      </form>
    </section>
  );
}

function TaskList({
  title,
  icon,
  tasks,
  agents,
  onAgentSelect,
}: {
  title: string;
  icon: ReactNode;
  tasks: Task[];
  agents: Agent[];
  onAgentSelect: (agentId: string) => void;
}) {
  const agentName = (agentId: string) => agents.find((agent) => agent.id === agentId)?.name ?? agentId;

  return (
    <section className="task-section">
      <div className="panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      <div className="task-list">
        {tasks.length === 0 ? <p className="empty">Sin elementos.</p> : null}
        {tasks.map((task) => (
          <button key={task.id} className={`task-row ${task.status}`} onClick={() => onAgentSelect(task.agentId)} type="button">
            <span className="task-main">
              <strong>{task.title}</strong>
              <small>{task.progress ?? task.result ?? "Registrada"}</small>
            </span>
            <span className="task-meta">
              <span>{agentName(task.agentId)}</span>
              <time>{formatTime(task.completedAt ?? task.startedAt ?? task.createdAt)}</time>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <section className="activity-section">
      <div className="panel-title">
        <Activity size={17} />
        <h2>Actividad</h2>
      </div>
      <div className="activity-list">
        {events.length === 0 ? <p className="empty">La actividad aparecera aqui.</p> : null}
        {events.map((event) => (
          <article key={event.id} className="activity-item">
            <time>{formatTime(event.at)}</time>
            <p>{event.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
