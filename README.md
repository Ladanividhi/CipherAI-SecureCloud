# CipherAI-SecureCloud

## Backend Structure

- core/
	- constants.py: Shared constants (CORS, limits, collection names)
	- paths.py: Common paths and directory setup
	- crypto.py: RSA key material utilities
	- security.py: Auth, `UserContext`, and token verification
- routes/
	- auth.py: `/auth/verify`, `/auth/me`
	- files.py: Upload, encrypt/decrypt, list, tags, download endpoints
- app.py: App factory wiring CORS and registering routers

All endpoints, request/response shapes, and behavior remain unchanged.