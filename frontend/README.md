# Reddit Saved Media Gallery - Svelte Frontend

This is a refactored Svelte version of the Reddit Saved Media Gallery frontend.

## Features

- Built with Svelte 5 (using runes for reactivity)
- Vite for fast development and building
- Infinite scroll with intersection observer
- Random/default order toggle
- Responsive design
- Dark theme

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

3. Update the `.env` file with your configuration:
```
VITE_API_URL=https://reddit.zhill.me/api
VITE_BACKEND_URL=http://localhost:4000
```

### Development

Run the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Building for Production

Build the app:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Project Structure

```
frontend-svelte/
├── src/
│   ├── components/
│   │   ├── Header.svelte
│   │   ├── MediaGallery.svelte
│   │   ├── MediaItem.svelte
│   │   └── LoadingSpinner.svelte
│   ├── stores/
│   │   └── config.js
│   ├── App.svelte
│   └── main.js
├── index.html
├── vite.config.js
├── svelte.config.js
└── package.json
```

## Key Differences from React Version

1. **Reactivity**: Uses Svelte 5 runes (`$state`, `$effect`, `$props`) instead of React hooks
2. **No Virtual DOM**: Svelte compiles to vanilla JavaScript, resulting in smaller bundle sizes
3. **Simpler State Management**: No need for Context API, uses simple stores
4. **Built-in Transitions**: Svelte has built-in animation and transition support
5. **Less Boilerplate**: More concise component syntax

## Environment Variables

- `VITE_API_URL`: Backend API URL
- `VITE_BACKEND_URL`: Backend server URL for media files
- `VITE_REDDIT_CLIENT_ID`: Reddit OAuth client ID (optional)
- `VITE_URL_REDDIT_CALLBACK`: Reddit OAuth callback URL (optional)

## Browser Support

- Modern browsers with ES6+ support
- Chrome, Firefox, Safari, Edge (latest versions)
