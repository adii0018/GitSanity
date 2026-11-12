const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function generateIconPng() {
  const width = 128;
  const height = 128;

  // Raw image data: height rows, each with 1 filter byte + width * 4 RGBA bytes
  const rowLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowLength);

  // Background color: #0B1B2B (RGBA: 11, 27, 43, 255)
  const bg = [11, 27, 43, 255];
  // Shield fill: #0284c7 (RGBA: 2, 132, 199, 255)
  const shieldFill = [2, 132, 199, 255];
  // Shield border: #38bdf8 (RGBA: 56, 189, 248, 255)
  const shieldBorder = [56, 189, 248, 255];
  // Checkmark: #ffffff (RGBA: 255, 255, 255, 255)
  const checkColor = [255, 255, 255, 255];

  function setPixel(x, y, rgba) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = y * rowLength + 1 + x * 4;
    rawData[offset] = rgba[0];
    rawData[offset + 1] = rgba[1];
    rawData[offset + 2] = rgba[2];
    rawData[offset + 3] = rgba[3];
  }

  // Fill entire background
  for (let y = 0; y < height; y++) {
    rawData[y * rowLength] = 0; // Filter: 0 (None)
    for (let x = 0; x < width; x++) {
      setPixel(x, y, bg);
    }
  }

  // Draw Shield shape
  // Center: x=64, top: y=24, bottom tip: x=64, y=106
  function isInsideShield(x, y, inset = 0) {
    const minX = 28 + inset;
    const maxX = 100 - inset;
    const topY = 24 + inset;
    const midY = 68;
    const botY = 106 - inset;

    if (x < minX || x > maxX || y < topY || y > botY) return false;

    if (y <= midY) {
      return true;
    }

    // Tapering to bottom tip (64, botY)
    const dy = (y - midY) / (botY - midY);
    const leftLimit = minX + (64 - minX) * dy;
    const rightLimit = maxX - (maxX - 64) * dy;
    return x >= leftLimit && x <= rightLimit;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isInsideShield(x, y, 0)) {
        if (!isInsideShield(x, y, 4)) {
          setPixel(x, y, shieldBorder);
        } else {
          setPixel(x, y, shieldFill);
        }
      }
    }
  }

  // Draw Checkmark
  // Checkmark points: (48, 62) -> (58, 74) -> (80, 48)
  function drawLine(x0, y0, x1, y1, thickness, rgba) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;
    while (true) {
      for (let tx = -thickness; tx <= thickness; tx++) {
        for (let ty = -thickness; ty <= thickness; ty++) {
          if (tx * tx + ty * ty <= thickness * thickness) {
            setPixel(cx + tx, cy + ty, rgba);
          }
        }
      }
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  }

  drawLine(46, 62, 57, 74, 3, checkColor);
  drawLine(57, 74, 82, 48, 3, checkColor);

  // Compress IDAT
  const compressedData = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: 6 (RGBA)
  ihdrData[10] = 0; // Compression: 0
  ihdrData[11] = 0; // Filter: 0
  ihdrData[12] = 0; // Interlace: 0
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT Chunk
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  const pngBuffer = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);

  const mediaDir = path.join(__dirname, '..', 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const iconPath = path.join(mediaDir, 'icon.png');
  fs.writeFileSync(iconPath, pngBuffer);
  console.log(`Generated ${iconPath} (${pngBuffer.length} bytes, 128x128 RGBA PNG)`);
}

generateIconPng();
