import { inflateSync } from "node:zlib";
export function validateImage(bytes: Buffer, mime: string) {
  const invalid = () => {
    throw new Error(
      "This image is damaged or incomplete. Save a fresh PNG/JPEG/GIF/WebP image and try again.",
    );
  };
  if (mime === "image/png") {
    if (
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return invalid();
    let offset = 8,
      ended = false,
      width = 0,
      height = 0;
    const image: Buffer[] = [];
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset);
      if (size > bytes.length - offset - 12) return invalid();
      const type = bytes.toString("ascii", offset + 4, offset + 8),
        data = bytes.subarray(offset + 8, offset + 8 + size);
      let crc = 0xffffffff;
      for (const value of bytes.subarray(offset + 4, offset + 8 + size)) {
        crc ^= value;
        for (let bit = 0; bit < 8; bit++)
          crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      if ((crc ^ 0xffffffff) >>> 0 !== bytes.readUInt32BE(offset + 8 + size))
        return invalid();
      if (type === "IHDR") {
        if (offset !== 8 || size !== 13) return invalid();
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        if (!width || !height || width * height > 40000000) return invalid();
      }
      if (type === "IDAT") image.push(data);
      offset += size + 12;
      if (type === "IEND") {
        ended = true;
        break;
      }
    }
    if (!ended || !width || !height || !image.length) return invalid();
    try {
      inflateSync(Buffer.concat(image), { maxOutputLength: 64 * 1024 * 1024 });
    } catch {
      return invalid();
    }
  } else if (mime === "image/jpeg") {
    if (
      bytes.length < 4 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff ||
      bytes[bytes.length - 1] !== 0xd9
    )
      return invalid();
  } else if (mime === "image/gif") {
    if (
      !/^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6)) ||
      bytes[bytes.length - 1] !== 0x3b
    )
      return invalid();
  } else if (mime === "image/webp") {
    if (
      bytes.length < 12 ||
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP" ||
      bytes.readUInt32LE(4) + 8 !== bytes.length
    )
      return invalid();
  }
}
