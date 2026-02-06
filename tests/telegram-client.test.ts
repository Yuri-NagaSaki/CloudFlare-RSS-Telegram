import { describe, it, expect, vi } from "vitest";
import { editMessageText } from "../src/telegram/client";

const config = {
  botToken: "token",
  webhookSecret: undefined,
  adminIds: new Set<number>(),
  multiuser: true,
  defaultInterval: 5,
  minimalInterval: 5,
  userSubLimit: -1,
  channelSubLimit: -1,
  imgRelayServer: "https://rsstt-img-relay.rongrong.workers.dev/",
  imagesWeserv: "https://wsrv.nl/",
  telegraphToken: undefined,
  defaultAdminChatId: undefined
};

describe("telegram client", () => {
  it("ignores 'message is not modified' on edit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: false, description: "Bad Request: message is not modified" })
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    try {
      const result = await editMessageText(config, 123, 456, "same text");
      expect(result.message_id).toBe(456);
      expect(result.chat.id).toBe(123);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
