import type { Agent, Position } from "./types";

export const desks: Record<string, Position> = {
  hermes1: { x: 31, y: 35 },
  hermes2: { x: 68, y: 34 },
  hermes3: { x: 31, y: 70 },
  hermes4: { x: 68, y: 69 },
};

export const poi: Array<{ id: string; label: string; position: Position; phrases: string[] }> = [
  {
    id: "coffee",
    label: "Cafe",
    position: { x: 13, y: 24 },
    phrases: ["Voy por cafe.", "Un poco de energia antes de seguir.", "Recargando foco."],
  },
  {
    id: "whiteboard",
    label: "Pizarra",
    position: { x: 50, y: 16 },
    phrases: ["Estoy ordenando ideas.", "Voy a mirar el plan.", "Esto necesita una buena estructura."],
  },
  {
    id: "sofa",
    label: "Sofa",
    position: { x: 85, y: 77 },
    phrases: ["Me despejo un minuto.", "Estoy dejando respirar el contexto.", "Pausa corta."],
  },
  {
    id: "library",
    label: "Archivo",
    position: { x: 88, y: 23 },
    phrases: ["Buscando referencias.", "Revisando notas viejas.", "A ver que encuentro aqui."],
  },
];

export const initialAgents: Agent[] = [
  {
    id: "hermes1",
    name: "Hermes 1",
    role: "Principal",
    color: "#f4c95d",
    status: "wandering",
    desk: desks.hermes1,
    position: { x: 50, y: 16 },
    lastActivity: "Listo para recibir tareas",
    phraseKind: "idle",
  },
];

export const agentPresets: Record<string, Omit<Agent, "status" | "position" | "lastActivity" | "phraseKind">> = {
  hermes2: {
    id: "hermes2",
    name: "Hermes 2",
    role: "Investigacion",
    color: "#66d9c9",
    desk: desks.hermes2,
  },
  hermes3: {
    id: "hermes3",
    name: "Hermes 3",
    role: "Redaccion",
    color: "#ff8f70",
    desk: desks.hermes3,
  },
  hermes4: {
    id: "hermes4",
    name: "Hermes 4",
    role: "Revision",
    color: "#9fb7ff",
    desk: desks.hermes4,
  },
};

export function makeAgent(agentId: string): Agent {
  const preset = agentPresets[agentId] ?? {
    id: agentId,
    name: agentId.replace(/^./, (char) => char.toUpperCase()),
    role: "Colaborador",
    color: "#d7de8a",
    desk: { x: 50, y: 50 },
  };

  return {
    ...preset,
    status: "wandering",
    position: { x: 50, y: 50 },
    lastActivity: "Detectado automaticamente",
    phraseKind: "idle",
  };
}

export function workingPhrase(taskTitle?: string, progress?: string) {
  if (progress) return progress;
  if (!taskTitle) return "Estoy trabajando en la tarea.";
  const compact = taskTitle.length > 44 ? `${taskTitle.slice(0, 41)}...` : taskTitle;
  return `Trabajando en: ${compact}`;
}
