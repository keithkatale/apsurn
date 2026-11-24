# GTM Builder - Setup Instructions

## Current Status

✅ Repository cloned successfully from https://github.com/keithkatale/gtm-builder  
✅ Updated to latest Next.js version (16.4.6)  
✅ Fixed package.json (removed problematic dependencies)  
⚠️ Dependencies NOT installed yet (npm hanging issue)

## Issue Encountered

npm install commands are hanging/timing out on your system. This appears to be a network, registry, or configuration issue with npm.

## Manual Steps Required

### Option 1: Try npm directly in your terminal

1. Open a NEW PowerShell terminal (not through Kiro)
2. Navigate to the project:
   ```powershell
   cd C:\Users\USER\Documents\Projects\Gtm-Apsurn
   ```
3. Try installing:
   ```powershell
   npm install --legacy-peer-deps
   ```
4. If successful, start the dev server:
   ```powershell
   npm run dev
   ```

### Option 2: Install and use pnpm (recommended by the project)

1. Install pnpm globally:
   ```powershell
   npm install -g pnpm
   ```
   or using standalone installer:
   ```powershell
   iwr https://get.pnpm.io/install.ps1 -useb | iex
   ```

2. Install dependencies:
   ```powershell
   pnpm install
   ```

3. Start dev server:
   ```powershell
   pnpm dev
   ```

### Option 3: Troubleshoot npm

If npm continues to hang, try these fixes:

1. **Clear npm cache:**
   ```powershell
   npm cache clean --force
   ```

2. **Check/set npm registry:**
   ```powershell
   npm config get registry
   npm config set registry https://registry.npmjs.org/
   ```

3. **Check network settings:**
   - Disable VPN if active
   - Check if antivirus/firewall is blocking npm
   - Try on a different network

4. **Increase timeout:**
   ```powershell
   npm config set fetch-timeout 60000
   npm config set fetch-retry-maxtimeout 120000
   ```

## Changes Made to package.json

Removed the following dependencies that were causing installation errors:
- `shadcn` (CLI tool, not a runtime dependency)
- `cn` (not needed, using clsx and tailwind-merge instead)
- `tw-animate-css` (can be added back if needed)

## Project Information

- **Framework:** Next.js 16.4.6
- **React:** 19
- **TypeScript:** 5.7.3
- **Styling:** Tailwind CSS v4
- **Package Manager:** pnpm (recommended) or npm

## Expected Result

Once dependencies are installed and the dev server starts, the app should be available at:
**http://localhost:3000**

## Next Steps After Server Starts

1. Open http://localhost:3000 in your browser
2. The GTM Builder application should load
3. Check the terminal for any errors or warnings

---

*Note: This document was created because automated npm installation was failing. Please follow these manual steps to complete the setup.*
