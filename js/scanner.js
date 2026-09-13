let activeStream = null;
let scanTimer = null;
let detecting = false;

export function cameraScannerSupported() {
  return Boolean(globalThis.BarcodeDetector && navigator.mediaDevices?.getUserMedia);
}

export async function startCameraScanner(video, onDetected) {
  if (!cameraScannerSupported()) throw new Error("Ebben a böngészőben a kamerás leolvasás nem támogatott. Írd be a kódot kézzel.");
  stopCameraScanner(video);
  const supported = await globalThis.BarcodeDetector.getSupportedFormats?.() || [];
  const preferred = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"].filter((format) => !supported.length || supported.includes(format));
  const detector = new globalThis.BarcodeDetector(preferred.length ? { formats: preferred } : undefined);
  activeStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
  });
  video.srcObject = activeStream;
  await video.play();
  scanTimer = globalThis.setInterval(async () => {
    if (detecting || video.readyState < 2) return;
    detecting = true;
    try {
      const [result] = await detector.detect(video);
      if (result?.rawValue) {
        stopCameraScanner(video);
        onDetected(result.rawValue);
      }
    } catch (error) {
      console.warn("A vonalkód képkockája nem volt feldolgozható:", error);
    } finally {
      detecting = false;
    }
  }, 350);
}

export function stopCameraScanner(video) {
  if (scanTimer) globalThis.clearInterval(scanTimer);
  scanTimer = null;
  activeStream?.getTracks().forEach((track) => track.stop());
  activeStream = null;
  if (video) video.srcObject = null;
}
