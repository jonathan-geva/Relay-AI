import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Attachment } from "./domain";
import { validateImage } from "./image-validation";
const imageMimes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const textExtensions = new Set([
  ".txt",
  ".md",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".html",
  ".css",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".log",
  ".sql",
  ".sh",
  ".ps1",
  ".c",
  ".cpp",
  ".h",
  ".rs",
  ".go",
  ".java",
  ".swift",
  ".kt",
  ".rb",
]);
export async function readAttachment(path: string): Promise<Attachment> {
  const file = await stat(path);
  if (!file.isFile()) throw new Error("Choose a file, not a folder.");
  const extension = extname(path).toLowerCase(),
    mime = imageMimes[extension];
  const limit = mime ? 10 * 1024 * 1024 : 256 * 1024;
  if (file.size > limit)
    throw new Error(
      `${basename(path)} exceeds the ${mime ? "10 MB image" : "256 KB text"} limit.`,
    );
  if (!mime && !textExtensions.has(extension))
    throw new Error(
      "Choose a supported text/code file or PNG, JPEG, GIF or WebP image. PDF extraction is not included.",
    );
  const bytes = await readFile(path);
  const base = {
    id: randomUUID(),
    name: basename(path),
    mime: mime || "text/plain",
    bytes: bytes.length,
  };
  if (mime) {
    validateImage(bytes, mime);
    return { ...base, data: `data:${mime};base64,${bytes.toString("base64")}` };
  }
  if (bytes.includes(0))
    throw new Error("This file appears to be binary, not UTF-8 text.");
  return {
    ...base,
    text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  };
}
export function attachmentText(message: {
  content: string;
  attachments?: Attachment[];
}) {
  return (
    message.content +
    (message.attachments || [])
      .filter((a) => a.text !== undefined)
      .map((a) => `\n\n---\nAttached file: ${a.name}\n\n${a.text}`)
      .join("")
  );
}
