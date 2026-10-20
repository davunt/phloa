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

	it("rejects malformed, out-of-range, duplicate, and unknown parameters", async () => {
		for (const suffix of [
			"?ratio=1.5:1",
			"?ratio=5:1",
			"?ratio=0:1",
			"?ratio=0001:1",
			"?ratio=1:1&ratio=2:1",
			"?foo=bar",
		]) {
			const response = await fetchWorker(`http://example.com/${suffix}`);

			expect(response.status).toBe(400);
			expect(response.headers.get("Content-Type")).toContain("application/json");
			await expect(response.json()).resolves.toEqual({
				error:
					"Ratio must be two positive integers separated by ':' with an aspect ratio from 1:4 to 4:1",
			});
		}
	});

	it("returns 404 for unsupported requests", async () => {
		expect((await fetchWorker("http://example.com/other")).status).toBe(404);
		expect((await fetchWorker("http://example.com/", "POST")).status).toBe(404);
	});
});
