export function encodePcm16ToWav(
	pcm: Uint8Array,
	sampleRate = 24000,
	channels = 1,
): ArrayBuffer {
	const bytesPerSample = 2;
	const blockAlign = channels * bytesPerSample;
	const byteRate = sampleRate * blockAlign;
	const dataSize = pcm.byteLength;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	const writeString = (offset: number, value: string) => {
		for (let index = 0; index < value.length; index += 1) {
			view.setUint8(offset + index, value.charCodeAt(index));
		}
	};

	writeString(0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeString(8, "WAVE");
	writeString(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bytesPerSample * 8, true);
	writeString(36, "data");
	view.setUint32(40, dataSize, true);
	new Uint8Array(buffer, 44).set(pcm);

	return buffer;
}

export function createSilencePcm16(durationMs: number, sampleRate = 24000): Uint8Array {
	const sampleCount = Math.max(0, Math.round((durationMs / 1000) * sampleRate));
	return new Uint8Array(sampleCount * 2);
}

export function normalizePcm16Loudness(pcm: Uint8Array, targetRms = 4000): Uint8Array {
	if (pcm.byteLength < 2) {
		return pcm;
	}

	const inputView = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
	const sampleCount = pcm.byteLength / 2;
	let sumSquares = 0;
	let peak = 0;

	for (let index = 0; index < sampleCount; index += 1) {
		const sample = inputView.getInt16(index * 2, true);
		sumSquares += sample * sample;
		const absolute = Math.abs(sample);
		if (absolute > peak) {
			peak = absolute;
		}
	}

	const rms = Math.sqrt(sumSquares / sampleCount);
	if (rms < 1) {
		return pcm;
	}

	let gain = targetRms / rms;
	if (peak > 0) {
		gain = Math.min(gain, (32767 * 0.98) / peak);
	}

	const normalized = new Uint8Array(pcm.byteLength);
	const outputView = new DataView(normalized.buffer);

	for (let index = 0; index < sampleCount; index += 1) {
		const scaled = Math.round(inputView.getInt16(index * 2, true) * gain);
		const clamped = Math.max(-32768, Math.min(32767, scaled));
		outputView.setInt16(index * 2, clamped, true);
	}

	return normalized;
}

export function concatPcm16(parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		merged.set(part, offset);
		offset += part.byteLength;
	}
	return merged;
}

export function concatArrayBuffers(parts: ArrayBuffer[]): ArrayBuffer {
	const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		merged.set(new Uint8Array(part), offset);
		offset += part.byteLength;
	}
	return merged.buffer;
}

export function decodeWavToPcm16(wav: Uint8Array): { pcm: Uint8Array; sampleRate: number } {
	if (wav.byteLength < 44) {
		throw new Error("Invalid WAV data.");
	}

	const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
	const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
	const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
	if (riff !== "RIFF" || wave !== "WAVE") {
		throw new Error("Invalid WAV header.");
	}

	let offset = 12;
	let sampleRate = 24000;
	let dataOffset = -1;
	let dataSize = 0;

	while (offset + 8 <= wav.byteLength) {
		const chunkId = String.fromCharCode(
			view.getUint8(offset),
			view.getUint8(offset + 1),
			view.getUint8(offset + 2),
			view.getUint8(offset + 3),
		);
		const chunkSize = view.getUint32(offset + 4, true);
		const chunkStart = offset + 8;

		if (chunkId === "fmt ") {
			sampleRate = view.getUint32(chunkStart + 4, true);
		} else if (chunkId === "data") {
			dataOffset = chunkStart;
			dataSize = chunkSize;
			break;
		}

		offset = chunkStart + chunkSize + (chunkSize % 2);
	}

	if (dataOffset < 0 || dataSize <= 0) {
		throw new Error("WAV data chunk missing.");
	}

	return {
		pcm: wav.slice(dataOffset, dataOffset + dataSize),
		sampleRate,
	};
}
