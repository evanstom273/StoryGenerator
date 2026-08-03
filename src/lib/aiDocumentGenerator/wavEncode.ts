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
