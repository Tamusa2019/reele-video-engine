// =============================================================================
// LLM Provider Interface
// =============================================================================

/**
 * Base interface for LLM providers.
 * All providers must implement this interface to be used by the LLMService.
 */
export interface LLMProvider {
  /** Provider name for logging and debugging */
  name: string;

  /** Generate a text response from a prompt */
  generate(prompt: string, systemPrompt?: string): Promise<string>;

  /** Generate a structured JSON response from a prompt */
  generateJSON<T>(prompt: string, systemPrompt?: string): Promise<T>;

  /** Check if this provider is currently available */
  isAvailable(): Promise<boolean>;
}
