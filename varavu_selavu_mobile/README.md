# TrackSpense by Cereberoos

This directory contains the React Native (Expo) mobile application for the TrackSpense expense tracker.

## Prerequisites

*   **Node.js** (v18+)
*   **Expo Go App:** Install this on your Android or iOS device to scan the QR code and run the app during development.
*   **Emulators (Optional):** Android Studio for Android Emulator, Xcode for iOS Simulator (Mac only).

## Quick Start

The easiest way to run the app is using the `Makefile` in the root directory, or using the commands below from this directory.

1.  **Start the Backend:**
    The backend must be running for the mobile app to function.
    ```bash
    # From root directory
    make start-backend
    ```
    *Note: The backend runs on `0.0.0.0:8000` to be accessible from emulators/devices.*

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Generate Assets:**
    Required for the first run to prevent missing icon errors.
    ```bash
    node generate_assets.js
    ```

4.  **Run the App:**
    *   **Android:** `npx expo run:android`
    *   **iOS:** `npx expo run:ios`
    *   **QR Code (for physical device):** `npx expo start`

## Configuration

*   **API URL:** The app attempts to connect to `http://10.0.2.2:8000` (Android Emulator default) or `localhost` (iOS Simulator).
*   **Physical Device:** If running on a physical device, update `src/api/apiconfig.ts` with your computer's LAN IP (e.g., `http://192.168.1.5:8000`).

## Architecture

This app uses:
*   **Expo:** Framework for universal React applications.
*   **React Navigation:** Stack and Tab navigation.
*   **Expo Secure Store:** For storing JWT tokens securely.
*   **Expo Image Picker:** For receipt uploads.
*   **Context API:** For global state management (Authentication).

See [../MOBILE_APP_ROADMAP.md](../MOBILE_APP_ROADMAP.md) for detailed architecture and implementation steps.
