# Publish VYNT for your CV

The modified files are prepared locally. Nothing has been pushed to your account, deployed publicly, submitted to a store or signed on your behalf.

## 1. Bring the changes into your repository

Use the supplied source ZIP. Keep a backup or create a branch first.

1. Extract `Vynt-1.1.0-source.zip`.
2. Copy its contents **into your existing Vynt repository**. Include `.github`, `.nvmrc` and the other dotfiles. Do not replace/delete your local `.git` directory.
3. Remove the previously tracked generated files from Git's index (new builds generate them):

   ```bash
   git rm -r --cached --ignore-unmatch dist-electron
   ```

4. Remove old template assets if still present: `public/vite.svg`, `public/electron-vite.svg`, `public/electron-vite.animate.svg` and `src/assets/react.svg`.
5. Use Node 22.12+ and run:

   ```bash
   npm ci
   npm run lint
   npm run build:web
   ```

6. Review the diff, then commit/push through your usual GitHub workflow. Version is set to **1.1.0**, above the existing v1.0.0 release.

Alternative: apply `Vynt-1.1.0.patch` from a clean checkout of the original inspected commit `c74d23cf152659c5b31a800790a87b48d407d5a8` using `git apply --check <path-to-patch>` then `git apply <path-to-patch>`. Do not apply the patch on top of the ZIP changes.

## 2. Put the demo online — GitHub Pages

1. Open **Vynt → Settings → Pages**.
2. Set **Source → GitHub Actions**. Enable Actions for the repository if needed.
3. Push these changes to `main`, or select **Actions → Deploy web demo → Run workflow**.
4. The workflow installs dependencies, lints, builds, tests and deploys `dist/`.
5. After it succeeds, open the URL shown by the deployment. For the current owner/repo it should be:

   **https://yash-tripath1.github.io/Vynt/**

6. Test in a normal browser tab over HTTPS; embedded previews can block camera/microphone permissions.
7. Add that verified address to the repository's About/Website field and README as the live-demo link.

**Alternative hosts:** import the repo into Vercel or Netlify; Node 22, build `npm run build:web`, publish `dist`. No backend or environment secrets are needed. The separate `Vynt-1.1.0-web.zip` contains ready-built static files for a manual static-host upload; don't deploy the source ZIP as the website.

## 3. Produce the Windows download

No local Windows build tools are needed if you use the included workflow.

### First, a test build

1. Open **Actions → Build Windows installer → Run workflow** on your updated branch.
2. After it passes, download the **VYNT-Windows-installer** artifact.
3. Extract and install the `*-Setup.exe` on Windows. Complete the checklist below.

### Then, a public release

From your updated local repo:

```bash
git tag v1.1.0
git push origin v1.1.0
```

The tag must match `package.json`. The workflow builds and smoke-tests the app, adds a SHA-256 checksum and creates a **draft** release. Open **Releases**, check the draft's installer and notes, update the size/signing/tested-platform information, then click **Publish release**. A failed build does not produce a public release automatically.

The expected asset is **VYNT-Windows-1.1.0-Setup.exe**. Do not upload `win-unpacked/VYNT.exe` alone.

**Signing is optional for a personal GitHub release, but recommended for public trust.** Without it, Windows can show SmartScreen/unknown-publisher warnings. Do not describe the build as signed, verified or store-approved. Do not ask users to disable security software. If you have a compatible certificate, configure repository secrets `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD` per electron-builder's signing requirements. Cloud/hardware-backed signing may need a different workflow.

## 4. Windows release checklist — required before publishing

- [ ] Fresh install and launch on a Windows x64 machine; record exact OS version.
- [ ] Verify the app/installer icons, product name and version.
- [ ] Camera access allowed, denied, unavailable and already in use.
- [ ] MIC ON: record real speech, save, replay the file and hear your voice.
- [ ] MIC OFF: video plays silently and microphone indicator stays off.
- [ ] Microphone denied, missing and unplugged while recording: useful error/recovery.
- [ ] Stop, record again, turn camera off during recording: correct save and cleanup.
- [ ] Save photo/video; cancel save; unwritable destination; filename with spaces/non-ASCII.
- [ ] Close/reload during recording: warning, no hidden camera/mic left running.
- [ ] All eight filters and both aspect ratios; photos have expected dimensions.
- [ ] Long recording / five-minute limit on a representative machine; monitor memory.
- [ ] Install over the old version and uninstall without deleting user-saved photos/videos.
- [ ] New app ID is intentional; the old template installer may remain a separate entry. Document migration if so.
- [ ] Open links and privacy notice; confirm downloads on the public web demo.
- [ ] Verify checksum; record actual installer size and signing status in the release notes.
- [ ] Choose a software license/EULA and review the privacy notice for your chosen hosting provider. None has been invented for you.

## 5. CV links and description

Use two stable links after verifying them:

- **Live demo:** the URL from the successful Pages deployment.
- **Windows download:** https://github.com/Yash-Tripath1/Vynt/releases/latest

Suggested CV bullet (use only after completing/testing the release):

> Built VYNT, a React/TypeScript and Electron photo booth with eight real-time Canvas filters, local photo export and microphone-enabled video recording; deployed a browser demo and distributed a Windows installer using GitHub Actions.

No store listing is required to put this on your CV. A functioning live demo and a clear Releases page are sufficient.

## 6. If you later want Microsoft Store

This package prepares a **GitHub-distributed Windows installer**, not a Store submission. Store publishing remains a separate task: current Partner Center enrollment/identity requirements, choice of supported submission/package type, publisher identity, applicable code signing, listing screenshots, support/privacy URLs, license/content declarations and certification testing. Confirm the current requirements in Microsoft's documentation before choosing packaging. Do not assume the NSIS installer is automatically accepted or that the app has been certified.
