export class HyphoraError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'HyphoraError';
  }
}

export class ConfigError extends HyphoraError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class AgentError extends HyphoraError {
  constructor(message: string) {
    super(message, 'AGENT_ERROR');
    this.name = 'AgentError';
  }
}

export class QueueError extends HyphoraError {
  constructor(message: string) {
    super(message, 'QUEUE_ERROR');
    this.name = 'QueueError';
  }
}

export class SecurityError extends HyphoraError {
  constructor(message: string) {
    super(message, 'SECURITY_ERROR');
    this.name = 'SecurityError';
  }
}
