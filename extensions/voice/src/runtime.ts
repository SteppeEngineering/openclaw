import type { OpenClawPluginRuntimeApi } from "openclaw/plugin-sdk";

let _runtime: OpenClawPluginRuntimeApi | null = null;

export function setVoiceRuntime(runtime: OpenClawPluginRuntimeApi): void {
  _runtime = runtime;
}

export function getVoiceRuntime(): OpenClawPluginRuntimeApi {
  if (!_runtime) {
    throw new Error("Voice runtime not initialized");
  }
  return _runtime;
}
