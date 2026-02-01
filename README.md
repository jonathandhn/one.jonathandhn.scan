# Event Scanner (one.jonathandhn.scan)

A React application built with Vite for managing events and scanning participant QR codes.

## Features

-   **Event Management**: View list of events.
-   **Participant Management**: View, add, and manage participants for specific events.
-   **QR Code Scanner**: Built-in scanner to verify participants using `@yudiel/react-qr-scanner` (Native Barcode Detection API).
-   **Internationalization**: Fully localized in English and French.
-   **Responsive UI**: Built with TailwindCSS and DaisyUI.

## Tech Stack

-   [React](https://react.dev/)
-   [Vite](https://vitejs.dev/)
-   [TailwindCSS](https://tailwindcss.com/) & [DaisyUI](https://daisyui.com/)
-   [React Router](https://reactrouter.com/)
-   [i18next](https://www.i18next.com/)
-   [@yudiel/react-qr-scanner](https://github.com/yudielcurbelo/react-qr-scanner)

## Getting Started

### Prerequisites

-   Node.js (Latest LTS recommended)
-   npm

### Installation

```bash
npm install
```

### Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173/scan/` (note the `/scan` basename).

### Build

Build for production:

```bash
npm run build
```

Failed to build? Ensure you have the latest dependencies installed. A known warning regarding chunk size may appear but does not block the build.

## Project Structure

-   `src/pages`: Main views (EventList, ParticipantList, Scanner, etc.)
-   `src/components`: Reusable UI components
-   `src/services`: Logic and API services
-   `src/locales`: Translation files (en, fr)

## Branding & Customization

The application is designed to be easily branded. All colors are centralized in `src/index.css`.

To change the theme colors (e.g., for SOS Homophobie identity):
1.  Open `src/index.css`.
2.  Modify the CSS variables in the `:root` block at the top of the file.

```css
:root {
    /* Primary Color (Blue) */
    --p: 197 100% 24%;
    
    /* Secondary/Accent Color (Pink) */
    --s: 327 84% 50%;
}
```

The application uses **OKLCH** color format for modern browser support and better color mixing, but you can use HSL, HEX, or RGB if preferred.

## Deployment / Installation from ZIP

This project includes a GitHub Action that automatically generates a production ZIP file on every push to `main`.

### How to use the ZIP:

1.  **Download** the latest artifact from the "Actions" tab in GitHub.
2.  **Extract** the contents.
3.  **Upload** the files to your server.

### Hosting Options

*   **Option 1: Same-Origin (Recommended)**
    *   Upload the files into a folder named `/scan` at the root of your CiviCRM website.
    *   URL: `https://yoursite.org/scan/`
    *   *Advantage*: No configuration required.

*   **Option 2: Cross-Origin**
    *   Hosting on a different domain (e.g., `scan.mydomain.com`).
    *   *Requirement*: You **must** configure CORS in CiviCRM (Administer > System Settings > Misc) to allow requests from your scanner's domain.

> **Note**: This build is hardcoded for the `/scan/` base path. If you need a different path (e.g., `/checkin/`), you must modify `vite.config.js` and rebuild from source.
