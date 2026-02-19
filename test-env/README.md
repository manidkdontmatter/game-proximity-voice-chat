# Local Test Environment

Everything for local testing is centralized in this folder.

## Start Everything

```powershell
powershell -ExecutionPolicy Bypass -File .\test-env\start-all.ps1
```

This opens two terminals:
- LiveKit (`--dev`)
- Control plane (`npm run -w @voice/proximity-voice-control dev`)

## Validate API/Policy Tests

```powershell
powershell -ExecutionPolicy Bypass -File .\test-env\check.ps1
```

## Browser Media Test (No Mic)

Open:
- `http://127.0.0.1:8080/debug`

Use two tabs:
- speaker tab publishes a synthetic tone
- listener tab should hear at `10m` and stop at `40m`
