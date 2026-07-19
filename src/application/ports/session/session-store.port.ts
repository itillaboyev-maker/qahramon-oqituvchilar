export interface BotSessionState<TData = Record<string, unknown>> {
  id: string;
  userId: string;
  botType: "public" | "admin";
  flowType: "none" | "nomination" | "self_submission" | "moderation_review";
  currentStep: string | null;
  collectedData: TData;
}

export interface SessionStorePort {
  get(userId: string, botType: "public" | "admin"): Promise<BotSessionState | null>;
  start(
    userId: string,
    botType: "public" | "admin",
    flowType: BotSessionState["flowType"],
  ): Promise<BotSessionState>;
  update(
    id: string,
    patch: Partial<Pick<BotSessionState, "currentStep" | "collectedData">>,
  ): Promise<BotSessionState>;
  clear(id: string): Promise<void>;
}
