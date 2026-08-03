import { describe, expect, it } from "vitest";
import {
	decodeGeminiInteractionAudioToPcm,
	extractGeminiInteractionAudioPayload,
	type GeminiInteractionPayload,
} from "../ai/geminiTts";

function encodeBytesToBase64(bytes: Uint8Array) {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

describe("geminiTts", () => {
	it("reads audio from output_audio convenience property", () => {
		const payload: GeminiInteractionPayload = {
			output_audio: {
				data: encodeBytesToBase64(new Uint8Array([1, 2, 3])),
			},
		};

		expect(extractGeminiInteractionAudioPayload(payload)?.data).toBe(payload.output_audio?.data);
		expect(decodeGeminiInteractionAudioToPcm(payload)).toEqual(new Uint8Array([1, 2, 3]));
	});

	it("reads audio from steps model_output blocks", () => {
		const pcm = new Uint8Array([4, 5, 6]);
		const payload: GeminiInteractionPayload = {
			steps: [
				{
					type: "model_output",
					content: [
						{
							type: "audio",
							data: encodeBytesToBase64(pcm),
						},
					],
				},
			],
		};

		expect(decodeGeminiInteractionAudioToPcm(payload)).toEqual(pcm);
	});

	it("reads audio from legacy outputs array", () => {
		const pcm = new Uint8Array([7, 8, 9]);
		const payload: GeminiInteractionPayload = {
			outputs: [
				{
					type: "audio",
					data: encodeBytesToBase64(pcm),
				},
			],
		};

		expect(decodeGeminiInteractionAudioToPcm(payload)).toEqual(pcm);
	});

	it("extracts pcm from wav payloads", () => {
		const wavHeader = new Uint8Array([
			0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74,
			0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x80, 0xbb, 0x00, 0x00, 0x00, 0x77,
			0x01, 0x00, 0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 0x04, 0x00, 0x00, 0x00,
		]);
		const pcm = new Uint8Array([0xaa, 0x00, 0xbb, 0x00]);
		const wav = new Uint8Array(wavHeader.length + pcm.length);
		wav.set(wavHeader, 0);
		wav.set(pcm, wavHeader.length);

		const payload: GeminiInteractionPayload = {
			output_audio: {
				data: encodeBytesToBase64(wav),
				mime_type: "audio/wav",
			},
		};

		expect(decodeGeminiInteractionAudioToPcm(payload)).toEqual(pcm);
	});
});
