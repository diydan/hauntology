/** The rear camera for scanning a Relic token (party-mode 9.7): asked for only when the Player taps Scan. The picture is never kept or sent. */
export const openRearCamera = (): Promise<MediaStream> => navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
