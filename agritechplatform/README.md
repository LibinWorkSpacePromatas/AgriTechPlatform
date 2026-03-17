# AgriTech Digital Twin - Vineyard Intelligence Platform

Enterprise-level agriculture production intelligence platform built with Angular 17+.

## Features

- **Dashboard Overview**: Real-time vineyard metrics and alerts
- **Vineyard Metrics**: Detailed environmental monitoring
- **Predictions**: AI-powered yield and disease forecasting
- **Recommendations**: Actionable management insights
- **Digital Twin**: 3D vineyard visualization
- **Settings**: Application configuration

## Technology Stack

- **Framework**: Angular 17+ (Standalone Components)
- **Language**: TypeScript
- **Styling**: CSS with custom agricultural theme
- **Time Zone**: Adelaide Time (Australia/Adelaide)

## Project Structure

```
agri-digital-twin-frontend/
├── src/
│   ├── app/
│   │   ├── core/              # Layout components (header, sidebar, footer)
│   │   ├── shared/            # Shared services, pipes, constants
│   │   └── modules/           # Feature modules
│   ├── styles.css             # Global styles
│   └── main.ts                # Application bootstrap
├── angular.json               # Angular CLI configuration
├── tsconfig.json              # TypeScript configuration
└── package.json               # Dependencies
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm start
```

The application will be available at `http://localhost:4200`

### Build

```bash
# Production build
npm run build
```

## Design System

### Color Theme

- **Primary**: Agricultural green (#2d5016)
- **Secondary**: Earth tones (#8b6f47)
- **Accent**: Gold (#d4a574)

### Status Badges

- **Low Risk**: Green
- **Medium Risk**: Orange
- **High Risk**: Red

### Layout

- Fixed header (64px)
- Left sidebar navigation (260px)
- Main content area (responsive)
- Fixed footer (48px)

## Development Guidelines

1. **Component Isolation**: Each module must be isolated under `/modules`
2. **No Global CSS Overrides**: Use the design system utilities
3. **Reusable Components**: Place in `/core` directory
4. **Shared Services**: Place in `/shared/services`
5. **Routing**: All routes declared in `app.routes.ts`

## License

Proprietary - AgriTech 2026
