# FakePlutonium — higher-resolution capture (experimental)

FakePlutonium first enables the **local** `feature_higher_video_quality` option. That part unlocks quality controls in Fluxer but does not guarantee the sender's captured track uses the selected resolution.

The optional **Enhance Source Capture** option also tries to increase the resolution of a full-monitor screen-share capture when Chromium unexpectedly returns a substantially lower-resolution track. Unlike a fake quality badge, the capture check uses the real `MediaStreamTrack.getSettings()` dimensions.

## Scope and safety

- Enhancement is **enabled by default** but is independently toggleable in Influx's FakePlutonium settings.
- Runs only within the Fluxer desktop protocol (`fluxer-app:`), for **full-monitor** captures, when quality is set to **Custom → Source**.
- Compares the captured video track's aspect ratio with the current monitor. Skips mismatched secondary displays and tracks already near the target.
- Estimates native monitor dimensions from `window.screen` and `devicePixelRatio` and requests up to **3840 pixels wide**. On a 5120×1440 ultrawide, that is about **3840×1080**.
- Uses the existing capture track's `applyConstraints()`; does not request screen-capture permission a second time or interfere with Fluxer's audio capture.
- If `applyConstraints` fails or Chromium refuses to upscale, returns the original stream without failing screen-share startup.
- Does **not** alter paid subscription records, token entitlements, server policies, codec SDP, quality limits for other features, or `max_screen_share_bitrate`.
- Higher capture resolution increases encoding and network load. Do not assume 4K60 or a guaranteed frame rate.

## Installation

From the latest successful GitHub Actions **Windows Test Build** workflow run in this PR, extract the entire `influx-windows-experimental` artifact. Close the Fluxer desktop app (including the tray process) and run in PowerShell:

```powershell
.\influx-installer-windows-x64.exe --local
```

Restart Fluxer, open its Influx Plugins screen and enable FakePlutonium. The settings should have both **Higher Stream Quality** and **Enhance Source Capture** enabled.

## How to test

1. **Stop** any existing stream entirely.
2. Select **Custom → Source → 60 FPS** in Fluxer's screen-share quality settings.
3. Share the **entire desktop monitor**, not an individual app window.
4. On the sender, open DevTools (`Ctrl+Shift+I`) and execute:

```js
window.Influx?.plugins?.FakePlutonium?.getStatus()
```

`captureHooked: true` confirms Influx installed the screen-capture wrapper. `qualityStateFound: true` confirms the plugin can read the selected quality. Check `lastCapture`:

| Result | Explanation |
|---|---|
| `upgraded` | Captured video track increased in pixel count after trying new constraints |
| `unchanged` | The request was accepted but capture dimensions did not increase |
| `rejected` | Chromium declined constraints; original stream remains usable |
| `already-near-target` | Capture is already sufficiently close, or safe monitor match is unavailable |
| `not-monitor` | The media capture call was not explicitly a monitor share |
| `not-custom-source` | The selected share isn't Custom/Source, or the enhancement is off |
| `quality-store-unavailable` | Influx did not find Fluxer's voice settings module |
| `not-started` | No display media capture has passed through the hook yet |

5. Use **Copy Stats for Nerds** on the sender. Compare `localScreenShare.frameWidth` / `frameHeight` and `framesPerSecond` with the browser receiving client's `video.videoWidth` / `video.videoHeight`.
6. Pay attention to `localScreenShare.encoderImplementation`, `qualityLimitationReason` and send bitrate. A browser accepting the capture constraints does not ensure the encoder transmits that resolution.

For the previous 5120×1440 ultrawide test, the reported sender track was **2708×762**, even though the configuration read **Custom / Source / 60 FPS**. The enhancement should *attempt* **3840×1080** for the same aspect ratio, within the sender's reported 3840-pixel hardware H.264 width support. The actual output may be lower.

**Troubleshooting:** If the new build does not hook screen capture, check `captureHooked` and `qualityStateFound` first. If `lastCapture.result` stays `not-started`, completely stop and restart the share. If capture is `upgraded` but the viewer is not, investigate encoder negotiation and transport bitrate rather than applying more capture constraints.

GitHub Actions verifies TypeScript, geometry safety tests, and compiled Windows installer smoke tests, but cannot test the live hardware and remote receiver on the user's PC.
