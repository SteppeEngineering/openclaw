import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { voicePlugin } from "./src/channel.js";
import { setVoiceRuntime } from "./src/runtime.js";

const plugin = {
  id: "voice",
  name: "Voice Channel",
  description: "Hardware voice assistant channel for Raspberry Pi",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setVoiceRuntime(api.runtime);
    api.registerChannel({ plugin: voicePlugin });
  },
};

export default plugin;
