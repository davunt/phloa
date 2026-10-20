import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

async function fetchWorker(url: string, method = "GET"): Promise<Response> {
	const context = createExecutionContext();
	const response = await worker.fetch(new IncomingRequest(url, { method }), env, context);
	await waitOnExecutionContext(context);
	return response;
}

function pngDimensions(bytes: Uint8Array): [number, number] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return [view.getUint32(16), view.getUint32(20)];
}

async function pngPixel(bytes: Uint8Array, x: number, y: number): Promise<[number, number, number]> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const width = view.getUint32(16);
	const compressed = bytes.subarray(41, bytes.length - 16);
	const scanlines = new Uint8Array(
		await new Response(
			new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate")),
		).arrayBuffer(),
	);
	const offset = y * (width * 4 + 1) + 1 + x * 4;

	return [scanlines[offset], scanlines[offset + 1], scanlines[offset + 2]];
}

describe("image worker", () => {
	it("returns the default 16:9 PNG image", async () => {
		const response = await fetchWorker("http://example.com/");
		const image = new Uint8Array(await response.arrayBuffer());

		expect(response.headers.get("Content-Type")).toBe("image/png");
		expect([...image.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
		expect(pngDimensions(image)).toEqual([1280, 720]);
	});

	it("uses the requested portrait ratio", async () => {
		const response = await fetchWorker("http://example.com/?ratio=9:16");
		const image = new Uint8Array(await response.arrayBuffer());

		expect(pngDimensions(image)).toEqual([720, 1280]);
	});

	it.each([
		["red", [255, 0, 0]],
		["green", [0, 128, 0]],
		["blue", [0, 0, 255]],
		["orange", [255, 165, 0]],
		["cyan", [0, 255, 255]],
	] as const)("colors the dots and square %s", async (color, expectedPixel) => {
		const response = await fetchWorker(`http://example.com/?color=${color}`);
		const image = new Uint8Array(await response.arrayBuffer());

		await expect(pngPixel(image, 20, 20)).resolves.toEqual(expectedPixel);
		await expect(pngPixel(image, 640, 200)).resolves.toEqual(expectedPixel);
	});

	it("rejects malformed, out-of-range, duplicate, and unknown parameters", async () => {
		for (const suffix of [
			"?ratio=1.5:1",
			"?ratio=5:1",
			"?ratio=0:1",
			"?ratio=0001:1",
			"?ratio=1:1&ratio=2:1",
			"?color=purple",
			"?color=red&color=blue",
			"?foo=bar",
		]) {
			const response = await fetchWorker(`http://example.com/${suffix}`);

			expect(response.status).toBe(400);
			expect(response.headers.get("Content-Type")).toContain("application/json");
			await expect(response.json()).resolves.toEqual({
				error:
					"Ratio must be two positive integers separated by ':' with an aspect ratio from 1:4 to 4:1, and color must be red, green, blue, orange, or cyan",
			});
		}
	});

	it("returns 404 for unsupported requests", async () => {
		expect((await fetchWorker("http://example.com/other")).status).toBe(404);
		expect((await fetchWorker("http://example.com/", "POST")).status).toBe(404);
	});
});
