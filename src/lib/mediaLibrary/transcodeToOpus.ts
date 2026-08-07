import { decodeWavToPcm16 } from "../aiDocumentGenerator/wavEncode";

const OPUS_WEBM_MIME = "audio/webm;codecs=opus";
const OPUS_OGG_MIME = "audio/ogg;codecs=opus";

export type OpusTranscodeResult = {
	bytes: Uint8Array;
	mimeType: "audio/webm" | "audio/ogg";
};

function resolveOpusMimeType(): string | null {
	if (typeof MediaRecorder === "undefined") {
		return null;
	}

	if (MediaRecorder.isTypeSupported(OPUS_WEBM_MIME)) {
		return OPUS_WEBM_MIME;
	}

	if (MediaRecorder.isTypeSupported(OPUS_OGG_MIME)) {
		return OPUS_OGG_MIME;
	}

	return null;
}

async function encodeAudioBufferToOpus(
	audioBuffer: AudioBuffer,
	mimeType: string,
): Promise<Uint8Array | null> {
	const audioContext = new AudioContext();
	const destination = audioContext.createMediaStreamDestination();
	const source = audioContext.createBufferSource();
	source.buffer = audioBuffer;
	source.connect(destination);

	const chunks: BlobPart[] = [];

	return await new Promise((resolve) => {
		let recorder: MediaRecorder;

		try {
			recorder = new MediaRecorder(destination.stream, {
				mimeType,
				audioBitsPerSecond: 64_000,
			});
		} catch {
			void audioContext.close();
			resolve(null);
			return;
		}

		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				chunks.push(event.data);
			}
		};

		recorder.onerror = () => {
			void audioContext.close();
			resolve(null);
		};

		recorder.onstop = async () => {
			try {
				const blob = new Blob(chunks, { type: mimeType.split(";")[0] ?? "audio/webm" });
				const bytes = new Uint8Array(await blob.arrayBuffer());
				resolve(bytes.length > 0 ? bytes : null);
			} catch {
				resolve(null);
			} finally {
				void audioContext.close();
			}
		};

		recorder.start(250);
		source.start(0);
		source.onended = () => {
			if (recorder.state !== "inactive") {
				recorder.stop();
			}
		};
	});
}

export function canTranscodeToOpus(): boolean {
	return resolveOpusMimeType() !== null;
}

export async function transcodeWavToOpus(wavBytes: Uint8Array): Promise<OpusTranscodeResult | null> {
	const mimeType = resolveOpusMimeType();
	if (!mimeType) {
		return null;
	}

	try {
		const wavCopy = wavBytes.slice().buffer;
		const audioContext = new AudioContext();
		let audioBuffer: AudioBuffer;

		try {
			audioBuffer = await audioContext.decodeAudioData(wavCopy);
		} catch {
			const { pcm, sampleRate } = decodeWavToPcm16(wavBytes);
			const channelCount = 1;
			const frameCount = Math.floor(pcm.byteLength / 2);
			audioBuffer = audioContext.createBuffer(channelCount, frameCount, sampleRate);
			const channel = audioBuffer.getChannelData(0);
			const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
			for (let index = 0; index < frameCount; index += 1) {
				channel[index] = view.getInt16(index * 2, true) / 32768;
			}
		} finally {
			void audioContext.close();
		}

		const bytes = await encodeAudioBufferToOpus(audioBuffer, mimeType);
		if (!bytes) {
			return null;
		}

		return {
			bytes,
			mimeType: mimeType.startsWith("audio/ogg") ? "audio/ogg" : "audio/webm",
		};
	} catch {
		return null;
	}
}
