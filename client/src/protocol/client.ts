import { EventEmitter } from "node:events";
import WebSocket from "ws";
import {
  ClientFrame,
  IncomingMessageFrame,
  MessageDeliveryFrame,
  PresenceResultFrame,
  ProfileRecord,
  RegisterFrame,
  ServerFrame
} from "../types.js";

export interface TheKeeperClientEvents {
  connected: [];
  disconnected: [string];
  incomingMessage: [IncomingMessageFrame];
  presenceResult: [PresenceResultFrame];
  messageDelivery: [MessageDeliveryFrame];
  errorFrame: [string, string];
}

type EventKeys = keyof TheKeeperClientEvents;

export class ProtocolClient extends EventEmitter {
  private socket?: WebSocket;
  private heartbeatTimer?: NodeJS.Timeout;
  private lastError?: string;

  constructor(private readonly serverUrl: string) {
    super();
  }

  override on<E extends EventKeys>(event: E, listener: (...args: TheKeeperClientEvents[E]) => void): this {
    return super.on(event, listener);
  }

  override emit<E extends EventKeys>(event: E, ...args: TheKeeperClientEvents[E]): boolean {
    return super.emit(event, ...args);
  }

  async connect(profile: ProfileRecord): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(this.serverUrl);
      this.socket = socket;
      this.lastError = undefined;

      socket.on("open", () => {
        const registerFrame: RegisterFrame = {
          type: "register",
          fingerprint: profile.publicKeyFingerprint,
          publicKeyArmored: profile.publicKeyArmored
        };
        socket.send(JSON.stringify(registerFrame));
      });

      socket.on("message", (data) => {
        const payload = typeof data === "string" ? data : data.toString("utf8");
        const frame = JSON.parse(payload) as ServerFrame;
        if (frame.type === "register_ok" && !settled) {
          settled = true;
          this.startHeartbeat();
          this.emit("connected");
          resolve();
          return;
        }
        if (frame.type === "error") {
          this.lastError = frame.message;
          if (!settled) {
            settled = true;
            reject(new Error(frame.message));
          }
        }
        this.handleFrame(frame);
      });

      socket.on("close", () => {
        this.stopHeartbeat();
        const reason = this.lastError ?? "Socket closed";
        if (!settled) {
          settled = true;
          reject(new Error(reason));
          return;
        }
        this.emit("disconnected", reason);
      });

      socket.on("error", (error) => {
        this.stopHeartbeat();
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.socket?.close();
  }

  send(frame: ClientFrame): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }
    this.socket.send(JSON.stringify(frame));
  }

  private handleFrame(frame: ServerFrame): void {
    switch (frame.type) {
      case "incoming_message":
        this.emit("incomingMessage", frame);
        break;
      case "presence_result":
        this.emit("presenceResult", frame);
        break;
      case "message_delivery":
        this.emit("messageDelivery", frame);
        break;
      case "error":
        this.emit("errorFrame", frame.code, frame.message);
        break;
      case "register_ok":
        break;
      default:
        break;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      this.socket.send(JSON.stringify({ type: "heartbeat" }));
    }, 10_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }
}
