export interface Attachment {
  type: 'image' | 'archive' | 'document';
  filename: string;
  localPath: string;
  mimeType: string;
  sizeBytes: number;
}

export interface InboundMessage {
  channelType: string;
  channelId: string;
  userId: string;
  messageId?: string;
  text: string;
  attachments?: Attachment[];
}

export interface OutboundMessage {
  text: string;
  replyToMessageId?: string;
  inlineKeyboard?: InlineButton[][];
}

export interface InlineButton {
  text: string;
  callbackData: string;
}

export interface ProgressUpdate {
  type: 'status' | 'tool_use' | 'reasoning';
  text: string;
  replaceMessageId?: string;
}

export interface ChannelAdapter {
  readonly type: string;

  start(): Promise<void>;
  stop(): Promise<void>;

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void;
  onCallback(
    handler: (
      channelId: string,
      userId: string,
      callbackData: string,
      messageId: string,
    ) => Promise<void>,
  ): void;

  sendMessage(channelId: string, msg: OutboundMessage): Promise<string>;
  editMessage(
    channelId: string,
    messageId: string,
    msg: OutboundMessage,
  ): Promise<void>;
  sendProgress(
    channelId: string,
    update: ProgressUpdate,
  ): Promise<string>;
  sendTypingIndicator(channelId: string): Promise<void>;
}
