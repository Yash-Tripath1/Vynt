## VYNT 1.1.0 — browser demo + voice recording

- Record your microphone alongside filtered video, or select MIC OFF for silent clips.
- Clear permission errors; microphone tracks are released after recording.
- Browser photo/video downloads alongside native desktop save dialogs.
- Branded Windows installer, icons, page metadata and privacy notice.
- Mobile camera-off control, keyboard focus styling, and recording format checks.
- Five-minute clip limit and recording-size safeguard.
- Updated build/runtime dependencies and automated browser/Electron smoke tests.

### Download

Use **VYNT-Windows-1.1.0-Setup.exe**, not an unpacked executable. A SHA-256 checksum accompanies the installer.

### Known limits

- Windows x64 target. Real Windows hardware/install tests must be completed before publishing this draft.
- Installer is unsigned unless the maintainer configures signing; SmartScreen/unknown-publisher warnings may appear.
- Video resolution is 640 pixels wide, up to 30 fps, with microphone audio only (no system audio).
- Clips are held in memory and limited to five minutes. Save before closing.
- Browser recording/download behaviour varies; recent desktop Chrome/Edge are recommended.
- No auto-updater; obtain newer versions from Releases.

Maintainer: verify the artifact, complete docs/PUBLISHING.md, update these notes with the tested Windows versions, actual installer size and signing status, then publish the draft.
