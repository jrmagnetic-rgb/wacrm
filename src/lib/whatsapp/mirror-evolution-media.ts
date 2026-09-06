import { extensionForMime } from "@/lib/media/filename";
import { buildMediaPath, MEDIA_MAX_BYTES } from "@/lib/storage/upload-media";

const BUCKET = "chat-media";

type EvolutionMediaArgs = {
  storage: any;
  accountId: string;
  messageId: string;
  instanceName: string;
  message: any;
  messageType: string;
};

function normalizeMime(value?: string | null): string | null {
  if (!value) return null;

  const mime = value
    .split(";")[0]
    .trim()
    .toLowerCase();

  return mime.includes("/") ? mime : null;
}

function mediaKind(messageType: string, mimeType: string | null): string {
  if (messageType === "imageMessage") return "image";
  if (messageType === "videoMessage") return "video";
  if (messageType === "audioMessage") return "audio";
  if (messageType === "documentMessage") return "document";

  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";
  if (mimeType?.startsWith("audio/")) return "audio";

  return "document";
}

function getMediaNode(message: any, messageType: string) {
  return message?.[messageType] ?? null;
}

function extractBase64(message: any, messageType: string): string | null {
  const node = getMediaNode(message, messageType);

  const value =
    node?.base64 ??
    message?.base64 ??
    null;

  if (!value || typeof value !== "string") {
    return null;
  }

  return value
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/\s/g, "");
}

function extractMime(message: any, messageType: string): string | null {
  const node = getMediaNode(message, messageType);

  return normalizeMime(
    node?.mimetype ??
    node?.mimeType ??
    message?.mimetype ??
    message?.mimeType
  );
}

function extractFileName(message: any, messageType: string): string | null {
  const node = getMediaNode(message, messageType);

  return (
    node?.fileName ??
    node?.filename ??
    node?.title ??
    null
  );
}

function extractCaption(message: any, messageType: string): string {
  const node = getMediaNode(message, messageType);

  return (
    node?.caption ??
    node?.description ??
    ""
  );
}

function safeFileName(
  messageId: string,
  messageType: string,
  mimeType: string | null,
  fileName?: string | null
): string {
  const ext = extensionForMime(mimeType);

  const cleanName = fileName
    ?.split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 40);

  const kind = mediaKind(messageType, mimeType);

  return `${messageId}-${cleanName || kind}.${ext}`;
}

async function getBase64FromEvolution(
  instanceName: string,
  messageId: string
): Promise<{
  base64: string;
  mimeType?: string | null;
} | null> {
  try {
    const response = await fetch(
      "https://zap.delivery73.com/chat/getBase64FromMediaMessage/" +
        encodeURIComponent(instanceName),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.EVOLUTION_API_KEY!,
        },
        body: JSON.stringify({
          message: {
            key: {
              id: messageId,
            },
          },
          convertToMp4: false,
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.warn(
        "[Evolution Media] Falha ao buscar base64:",
        response.status
      );
      return null;
    }

    const result = await response.json();

    const base64 =
      result?.base64 ??
      result?.data?.base64 ??
      result?.response?.base64 ??
      null;

    if (!base64 || typeof base64 !== "string") {
      console.warn(
        "[Evolution Media] Evolution respondeu sem base64:",
        result
      );
      return null;
    }

    return {
      base64: base64
        .replace(/^data:[^;]+;base64,/, "")
        .replace(/\s/g, ""),
      mimeType:
        result?.mimetype ??
        result?.mimeType ??
        result?.data?.mimetype ??
        result?.data?.mimeType ??
        null,
    };
  } catch (error) {
    console.warn(
      "[Evolution Media] Erro ao buscar mídia:",
      error instanceof Error ? error.message : error
    );

    return null;
  }
}

export async function mirrorEvolutionMedia(
  args: EvolutionMediaArgs
): Promise<{
  mediaUrl: string | null;
  mediaType: string | null;
  contentType: string;
  contentText: string;
}> {
  const {
    storage,
    accountId,
    messageId,
    instanceName,
    message,
    messageType,
  } = args;

  const node = getMediaNode(message, messageType);

  let mimeType = extractMime(message, messageType);
  let base64 = extractBase64(message, messageType);

  if (!base64) {
    const downloaded = await getBase64FromEvolution(
      instanceName,
      messageId
    );

    if (downloaded) {
      base64 = downloaded.base64;
      mimeType =
        normalizeMime(downloaded.mimeType) ??
        mimeType;
    }
  }

  const contentText = extractCaption(message, messageType);

  if (!base64) {
    console.warn(
      "[Evolution Media] Nenhum base64 disponível:",
      messageId
    );

    return {
      mediaUrl: null,
      mediaType: mimeType,
      contentType: mediaKind(messageType, mimeType),
      contentText,
    };
  }

  try {
    const buffer = Buffer.from(base64, "base64");

    if (!buffer.byteLength) {
      throw new Error("Base64 vazio");
    }

    if (buffer.byteLength > MEDIA_MAX_BYTES) {
      console.warn(
        `[Evolution Media] Mídia ${messageId} excede ${MEDIA_MAX_BYTES} bytes`
      );

      return {
        mediaUrl: null,
        mediaType: mimeType,
        contentType: mediaKind(messageType, mimeType),
        contentText,
      };
    }

    const finalMime =
      mimeType ??
      normalizeMime(node?.mimetype) ??
      "application/octet-stream";

    const fileName = safeFileName(
      messageId,
      messageType,
      finalMime,
      extractFileName(message, messageType)
    );

    const path = buildMediaPath(
      accountId,
      fileName,
      null,
      "inbound"
    );

    const { error } = await storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: finalMime,
        cacheControl: "3600",
        upsert: true,
      });

    if (error) {
      console.warn(
        "[Evolution Media] Erro no upload:",
        error.message
      );

      return {
        mediaUrl: null,
        mediaType: finalMime,
        contentType: mediaKind(messageType, finalMime),
        contentText,
      };
    }

    const {
      data: { publicUrl },
    } = storage
      .from(BUCKET)
      .getPublicUrl(path);

    console.log("[Evolution Media] Mídia salva:", {
      messageId,
      messageType,
      mimeType: finalMime,
      size: buffer.byteLength,
      path,
    });

    return {
      mediaUrl: publicUrl || null,
      mediaType: finalMime,
      contentType: mediaKind(messageType, finalMime),
      contentText,
    };
  } catch (error) {
    console.warn(
      "[Evolution Media] Erro ao processar:",
      messageId,
      error instanceof Error ? error.message : error
    );

    return {
      mediaUrl: null,
      mediaType: mimeType,
      contentType: mediaKind(messageType, mimeType),
      contentText,
    };
  }
}
