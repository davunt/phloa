const MAX_RATIO_TERM = 10_000;
const MAX_LONG_EDGE = 1_280;

type Ratio = {
	width: number;
	height: number;
};

const GLYPHS: Record<string, readonly string[]> = {
	'0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
	'1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
	'2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
	'3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
	'4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
	'5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
	'6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
	'7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
	'8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
	'9': ['01110', '10001', '10001', '01111', '00001', '00010', '11100'],
	':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
};

function parseRatio(url: URL): Ratio | null {
	const entries = [...url.searchParams.entries()];
	if (entries.some(([key]) => key !== 'ratio')) {
		return null;
	}

	const values = url.searchParams.getAll('ratio');
	if (values.length === 0) {
		return { width: 16, height: 9 };
	}
	if (values.length !== 1) {
		return null;
	}

	const match = /^([1-9]\d{0,3}|10000):([1-9]\d{0,3}|10000)$/.exec(values[0]);
	if (!match) {
		return null;
	}

	const width = Number(match[1]);
	const height = Number(match[2]);
	if (width < 1 || height < 1 || width > MAX_RATIO_TERM || height > MAX_RATIO_TERM || width / height < 1 / 4 || width / height > 4) {
		return null;
	}

	return { width, height };
}

function setPixel(pixels: Uint8Array, width: number, x: number, y: number, red: number, green: number, blue: number): void {
	const offset = (y * width + x) * 4;
	pixels[offset] = red;
	pixels[offset + 1] = green;
	pixels[offset + 2] = blue;
	pixels[offset + 3] = 255;
}

function fillRect(
	pixels: Uint8Array,
	width: number,
	x: number,
	y: number,
	rectWidth: number,
	rectHeight: number,
	red: number,
	green: number,
	blue: number,
): void {
	for (let row = Math.max(0, y); row < y + rectHeight; row++) {
		for (let column = Math.max(0, x); column < x + rectWidth; column++) {
			setPixel(pixels, width, column, row, red, green, blue);
		}
	}
}

function drawDots(pixels: Uint8Array, width: number, height: number): void {
	const radius = 6;
	for (let centerY = 20; centerY < height; centerY += 40) {
		for (let centerX = 20; centerX < width; centerX += 40) {
			for (let y = -radius; y <= radius; y++) {
				for (let x = -radius; x <= radius; x++) {
					if (x * x + y * y <= radius * radius) {
						setPixel(pixels, width, centerX + x, centerY + y, 0, 0, 0);
					}
				}
			}
		}
	}
}

function drawLabel(
	pixels: Uint8Array,
	width: number,
	height: number,
	label: string,
	squareX: number,
	squareY: number,
	squareSize: number,
): void {
	const desiredScale = Math.max(1, Math.floor(Math.max(24, squareSize * 0.2) / 7));
	const units = label.length * 6 - 1;
	const scale = Math.min(desiredScale, Math.max(1, Math.floor((squareSize * 0.8) / units)));
	const textWidth = units * scale;
	const textHeight = 7 * scale;
	const startX = Math.round(squareX + (squareSize - textWidth) / 2);
	const startY = Math.round(squareY + (squareSize - textHeight) / 2);

	for (let index = 0; index < label.length; index++) {
		const glyph = GLYPHS[label[index]];
		for (let row = 0; row < glyph.length; row++) {
			for (let column = 0; column < glyph[row].length; column++) {
				if (glyph[row][column] === '1') {
					fillRect(pixels, width, startX + (index * 6 + column) * scale, startY + row * scale, scale, scale, 255, 255, 255);
				}
			}
		}
	}
}

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) {
			crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
	const bytes = new Uint8Array(12 + data.length);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, data.length);
	bytes.set(new TextEncoder().encode(type), 4);
	bytes.set(data, 8);
	view.setUint32(8 + data.length, crc32(bytes.subarray(4, 8 + data.length)));
	return bytes;
}

async function encodePng(width: number, height: number, pixels: Uint8Array): Promise<Uint8Array> {
	const scanlines = new Uint8Array(height * (width * 4 + 1));
	for (let y = 0; y < height; y++) {
		const destination = y * (width * 4 + 1);
		scanlines.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), destination + 1);
	}

	const compressed = new Uint8Array(
		await new Response(new Blob([scanlines]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer(),
	);
	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, width);
	view.setUint32(4, height);
	header[8] = 8;
	header[9] = 6;
	const chunks = [
		new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
		createChunk('IHDR', header),
		createChunk('IDAT', compressed),
		createChunk('IEND', new Uint8Array()),
	];
	const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.length;
	}
	return output;
}

async function createImage(ratio: Ratio): Promise<Uint8Array> {
	const landscape = ratio.width >= ratio.height;
	const width = landscape ? MAX_LONG_EDGE : Math.round((MAX_LONG_EDGE * ratio.width) / ratio.height);
	const height = landscape ? Math.round((MAX_LONG_EDGE * ratio.height) / ratio.width) : MAX_LONG_EDGE;
	const pixels = new Uint8Array(width * height * 4).fill(255);
	drawDots(pixels, width, height);

	const squareSize = Math.round(Math.min(width, height) * 0.6);
	const squareX = Math.round((width - squareSize) / 2);
	const squareY = Math.round((height - squareSize) / 2);
	fillRect(pixels, width, squareX, squareY, squareSize, squareSize, 0, 0, 0);
	drawLabel(pixels, width, height, `${ratio.width}:${ratio.height}`, squareX, squareY, squareSize);

	return encodePng(width, height, pixels);
}

function errorResponse(): Response {
	return Response.json(
		{ error: "Ratio must be two positive integers separated by ':' with an aspect ratio from 1:4 to 4:1" },
		{
			status: 400,
		},
	);
}

export default {
	async fetch(request): Promise<Response> {
		const url = new URL(request.url);
		if (request.method !== 'GET' || url.pathname !== '/') {
			return new Response('Not Found', { status: 404 });
		}

		const ratio = parseRatio(url);
		if (!ratio) {
			return errorResponse();
		}

		return new Response(await createImage(ratio), {
			headers: {
				'Content-Type': 'image/png',
			},
		});
	},
} satisfies ExportedHandler<Env>;
