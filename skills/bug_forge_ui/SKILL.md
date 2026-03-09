---
name: Bug-Forge UI System
description: A complete set of reusable React, Tailwind v4 components featuring a minimalistic, Apple-inspired dark/light theme (small buttons, specific animations).
---

# Bug-Forge UI System

This skill provides a robust foundation for building modern, minimalistic desktop applications using React and Tailwind CSS v4. It contains pre-styled components (Buttons, Badges, Inputs) and layout shells specifically designed for Electron apps.

## Key Features
- **Compact Sizing**: Buttons and inputs are designed smaller (`h-6`, `h-8`) to maximize screen real estate for tools.
- **Enhanced Light/Dark Modes**: CSS variables cleanly map to both Dark and Light modes.
- **Micro-interactions**: Hover states, pulse indicators, and fluid toast animations.

## How to use this UI in a new app

When building a new React/Electron frontend within `fox-auto` (e.g. for `irs_bot` or others), follow these steps to integrate the Bug-Forge UI:

1. **Install Dependencies**:
   Ensure you have configured Tailwind CSS v4 and `lucide-react` for icons.
   *(We recommend `clsx` and `tailwind-merge` which are used in `lib/utils.ts`)*

2. **Copy the UI Core**:
   Copy the contents of `skills/bug_forge_ui/` into your new app's `src/` directory.

3. **Import CSS**:
   In your main App or `main.tsx` file, import `index.css`:
   ```tsx
   import './index.css' // The CSS file from bug_forge_ui
   ```

4. **Component Usage**:
   Use components exactly as you would in Bug-Forge:
   ```tsx
   import { Button } from './components/base/Button'
   import { Badge } from './components/base/Badge'

   function Example() {
     return (
       <div className="bg-surface p-4 rounded-md">
         <Badge variant="success">Running</Badge>
         <Button variant="primary" size="sm">Start Bot</Button>
       </div>
     )
   }
   ```

## Files Provided
- `index.css`: Contains CSS variables, font-face definitions, and custom Tailwind utilities like `@utility box-inner-border`.
- `lib/utils.ts`: Contains the standard `cn()` merge function.
- `components/base/`: Button, Badge, Input, PulseIndicator, ToastViewport, TrafficLights.
- `components/layout/`: AppShell, Header, SidebarPrimary, StandardViewShell.

**Note on Light Mode:** To force light mode, simply apply `<html class="light">`. The CSS automatically handles the color mapping gracefully.
