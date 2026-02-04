# CiviScan (one.jonathandhn.scan)

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

### Build Configuration (Environment Variables & Branding)

You can customize the application behavior and branding at build time using environment variables or by creating a `.env` file.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `VITE_APP_TITLE` | `CiviScan` | **Branding:** Name of the application (Title & Home screen). |
| `VITE_APP_COLOR_PRIMARY` | `#00577b` | **Branding:** Primary brand color (Hex format). |
| `VITE_GRACE_PERIOD` | `30` | Minutes after an event ends during which it remains editable (Grace Period). |
| `VITE_SHOW_PAST_EVENTS` | `false` | Set to `true` to show past events by default in the list. |
| `VITE_ENABLE_SHARE_LINK` | `false` | Set to `true` to enable the "Share Configuration" link in Settings. |
| `VITE_HIDE_POWERED_BY` | `false` | Set to `true` to hide the "Powered by CiviCRM" footer. |

**Example: White-Label Build**

To build a "GreenEvent" branded version:

```bash
VITE_APP_TITLE="GreenEvent" VITE_APP_COLOR_PRIMARY="#009900" npm run build
```

### White-Labeling (Runtime Configuration)

This application supports "Write Once, Run Anywhere" configuration. You can inject configuration values directly into `index.html` without rebuilding the application (perfect for CiviCRM Extensions).

The application looks for a global `window.CIVI_CONFIG` object. You can inject this script block into the `<head>` of `index.html`:

```html
<script>
  window.CIVI_CONFIG = {
    featureOauth: 'true', // Enable/Disable OAuth
    oauthAuthority: 'https://crm.example.org',
    oauthClientId: 'my_client_id'
  };
</script>
```

When building with Vite (`npm run build`), the following placeholders in `index.html` are automatically replaced by your `.env` variables:
- `%VITE_FEATURE_OAUTH%`
- `%VITE_OAUTH_AUTHORITY%`
- `%VITE_OAUTH_CLIENT_ID%`

This allows you to either build a static version with baked-in config OR deploy a generic version and inject config dynamically via your server/CMS.

### 7. AuthX Configuration (Critical)
To allow the Magic Link (and OAuth) to work correctly, you must configure **AuthX** settings in CiviCRM:
1.  Go to **Administer > System Settings > AuthX**.
2.  Enable **"JSON Web Token"** for **"Acceptable credentials (HTTP Header)"**.
    *   *Why?* The app sends the token via the `Authorization: Bearer` header. If this is disabled, CiviCRM will reject valid tokens with a 403 error.
3.  Ensure **"Optionally load user accounts"** is selected for "User account requirements (HTTP Header)".

> 📚 **More Info**: [AuthX Documentation](https://docs.civicrm.org/dev/en/latest/framework/authx/)

### 8. Generating a Test Token (Magic Link)
To generate a valid token for testing (replace `2` with your Contact ID):

```bash
cv ev "echo Civi::service('crypto.jwt')->encode(['exp' => time() + 86400, 'sub' => 'cid:2', 'scope' => 'authx']) . PHP_EOL;"
```

### 9. PWA Deep Linking
To allow the Magic Link to open directly in the installed App (instead of the browser):
- **Android/iOS**: Use standard `https://` links. The `manifest.webmanifest` is configured with `scope: "/scan/"`.
- **Magic Link Format**: `https://your-site.org/scan/?token=YOUR_JWT_TOKEN`
- If testing cross-domain (e.g. localhost -> prod), append `&url=https://your-site.org`.

## Project Structure

-   `src/pages`: Main views (EventList, ParticipantList, Scanner, etc.)
-   `src/components`: Reusable UI components
-   `src/services`: Logic and API services
-   `src/locales`: Translation files (en, fr)

## Branding & Customization

The application supports **White Labeling** via environment variables.

*   **App Name**: `VITE_APP_TITLE`
*   **Primary Color**: `VITE_APP_COLOR_PRIMARY`

These variables automatically update:
1.  The HTML Title
2.  The PWA Manifest (App Name, Short Name, Theme Color)
3.  The CSS Primary Color

You do not need to edit `src/index.css` manually unless you want deeper customization.

## Deployment / Installation from ZIP

This project includes a GitHub Action that automatically generates a production ZIP file.

### How to use the ZIP:

1.  **Download** the latest release/artifact from GitHub.
2.  **Extract** the contents.
3.  **Upload** the files to your server.

### Hosting Options

*   **Option 1: Same-Origin (Recommended)**
    *   Upload the files into a folder named `/scan` at the root of your CiviCRM website.
    *   URL: `https://yoursite.org/scan/`
    *   *Advantage*: No configuration required.

*   **Option 2: Cross-Origin**
    *   Hosting on a different domain (e.g., `scan.mydomain.com`).
    *   *Requirement*: You **must** configure CORS on your server or CiviCRM settings to allow requests from your scanner's domain.

> **Note**: This build is hardcoded for the `/scan/` base path. If you need a different path (e.g., `/checkin/`), you must modify `vite.config.js` and rebuild from source.

## GitHub Actions (CI/CD)

To build the application with your specific branding via GitHub Actions:

1.  Go to your GitHub Repository.
2.  Navigate to **Settings > Secrets and variables > Actions**.
3.  Click on the **Variables** tab (Not Secrets, unless sensitive).
4.  Add the following **Repository variables**:
    *   `VITE_APP_TITLE`: Your App Name (e.g. `CiviScan`)
    *   `VITE_APP_COLOR_PRIMARY`: Your Color (e.g. `#00577b`)
    *   `VITE_FEATURE_OAUTH`: `false` (or `true`)

The `release.yml` workflow is already configured to automatically use these variables during the build.

