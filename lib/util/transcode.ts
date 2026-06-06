// Source formats that mobile native players (Android ExoPlayer / iOS AVPlayer) can't
// decode, so they must be transcoded server-side (Navidrome via ffmpeg) to play at all.
const INCOMPATIBLE_SUFFIXES = new Set([
    'wma', 'wmv', 'asf', // Windows Media
    'ape',               // Monkey's Audio
    'wv',                // WavPack
    'tak',               // Tom's lossless Audio Kompressor
    'tta',               // True Audio
    'mpc', 'mpp',        // Musepack
]);

// Safe transcode target for incompatible sources: it's a default Navidrome transcoder,
// plays on both Android and iOS, and is cheap to encode.
export const FALLBACK_TRANSCODE_FORMAT = 'mp3';

/**
 * Whether a track's source format needs server-side transcoding to be playable on mobile.
 * Returns false for unknown/empty suffixes so we never transcode unnecessarily.
 */
export function needsTranscode(suffix?: string): boolean {
    if (!suffix) return false;
    return INCOMPATIBLE_SUFFIXES.has(suffix.toLowerCase());
}
