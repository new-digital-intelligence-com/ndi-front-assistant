export type Attachment = {
  name: string;
  type: string;
  previewUrl?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
  attachments?: Attachment[];
};

export type AssistantMode = "chat" | "voice" | "avatar" | "aida";

export type AvatarOrientation = "horizontal" | "vertical";

/** The language of a voice or avatar call. Ellie has a Polish preset in ElevenLabs; English is the default. */
export type CallLanguage = "en" | "pl";

export const ACCEPTED_FILE_TYPES = "image/png,image/jpeg,image/webp,image/gif,application/pdf";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 3;
