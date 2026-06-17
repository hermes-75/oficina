export type AgentStatus = "idle" | "wandering" | "returning" | "working" | "done" | "failed";
export type Facing = "right" | "up" | "left" | "down";
export type AgentMotion = "idle" | "walk";

export interface Position {
  x: number;
  y: number;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  color: string;
  spritePath: string;
  facing: Facing;
  motion: AgentMotion;
  status: AgentStatus;
  desk: Position;
  position: Position;
  currentTaskId?: string;
  currentTaskTitle?: string;
  lastActivity?: string;
  lastSaid?: string;
  phraseKind: "idle" | "working";
}

export type TaskStatus = "running" | "done" | "failed" | "cancelled";

export interface Task {
  id: string;
  parentId?: string;
  title: string;
  agentId: string;
  status: TaskStatus;
  progress?: string;
  result?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  topic?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  agentId?: string;
  taskId?: string;
  text: string;
  at: string;
}

export interface ActivityEvent {
  id: string;
  agentId: string;
  taskId?: string;
  message: string;
  at: string;
}

export type BridgeEvent =
  | { type: "bridge.ready"; mode: "mock" | "hermes"; primaryAgentId: string }
  | {
      type: "chat.accepted";
      taskId: string;
      agentId: string;
      userMessage: string;
      at: string;
    }
  | { type: "chat.delta"; taskId: string; agentId: string; delta: string }
  | { type: "chat.final"; taskId: string; agentId: string; message: string }
  | { type: "agent.said"; agentId: string; taskId?: string; text: string }
  | { type: "task.started"; task: Task; activity?: ActivityEvent }
  | {
      type: "task.progress";
      taskId: string;
      agentId: string;
      progress: string;
      activity?: ActivityEvent;
    }
  | {
      type: "task.completed";
      taskId: string;
      agentId: string;
      result?: string;
      completedAt: string;
      activity?: ActivityEvent;
    }
  | {
      type: "task.failed";
      taskId: string;
      agentId: string;
      error: string;
      completedAt: string;
    };
