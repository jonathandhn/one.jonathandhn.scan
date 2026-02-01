# Event Scanner (one.jonathandhn.scan)

A React application built with Vite for managing events and scanning participant QR codes.

## Features

-   **Event Management**: View list of events.
-   **Participant Management**: View, add, and manage participants for specific events.
-   **QR Code Scanner**: Built-in scanner to verify participants using `html5-qrcode`.
-   **Internationalization**: Fully localized in English and French.
-   **Responsive UI**: Built with TailwindCSS and DaisyUI.

## Tech Stack

-   [React](https://react.dev/)
-   [Vite](https://vitejs.dev/)
-   [TailwindCSS](https://tailwindcss.com/) & [DaisyUI](https://daisyui.com/)
-   [React Router](https://reactrouter.com/)
-   [i18next](https://www.i18next.com/)
-   [html5-qrcode](https://github.com/mebjas/html5-qrcode)

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
