# Aaybee

A React Native app built with Expo and TypeScript.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [Expo Go](https://expo.dev/go) app installed on your mobile device (iOS or Android)

## Setup

1. Navigate to the project directory:
   ```bash
   cd Aaybee
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running the App

Start the development server:

```bash
npm start
```

This will open the Expo developer tools. You can then:

- **On your phone**: Scan the QR code with the Expo Go app (Android) or Camera app (iOS)
- **On Android emulator**: Press `a` in the terminal
- **On iOS simulator**: Press `i` in the terminal (macOS only)
- **On web browser**: Press `w` in the terminal

### Alternative Commands

```bash
npm run android   # Start on Android device/emulator
npm run ios       # Start on iOS simulator (macOS only)
npm run web       # Start in web browser
```

## Project Structure

```
Aaybee/
├── App.tsx           # Main application component
├── app.json          # Expo configuration
├── babel.config.js   # Babel configuration
├── tsconfig.json     # TypeScript configuration
├── package.json      # Project dependencies
├── assets/           # App icons and splash screens
└── node_modules/     # Installed dependencies
```

## Customization

- **App name and slug**: Edit `app.json`
- **App icons**: Replace files in the `assets/` folder
- **Main component**: Edit `App.tsx`

## Learn More

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
